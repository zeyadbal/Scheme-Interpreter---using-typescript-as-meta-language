// L5-type-equations
import * as R from "ramda";
import * as A from "./L5-ast";
import * as S from "./L5-substitution-adt";
import * as TC from "./L5-typecheck";
import * as T from "./TExp";
import { isError, safeF, trust } from './error';
import {first, rest} from "./list";

// ============================================================n
// Pool ADT
// A pool represents a map from Exp to TExp
// It is implemented as a list of pairs (Exp TExp).
// When a new Exp is added to a pool, a fresh Tvar
// is allocated for it.
export interface PoolItem {e: A.Exp, te: T.TExp};
export type Pool = PoolItem[];

export const makeEmptyPool = () => [];
export const isEmptyPool = (x: any): boolean => x.length === 0;

// Purpose: construct a pool with one additional pair
//          (exp fresh-tvar)
// @Pre: exp is not already in pool.
export const extendPool = (exp: A.Exp, pool: Pool): Pool =>
    R.prepend({e: exp, te: T.makeFreshTVar()}, pool);

// Purpose: construct a pool with one additional pair
//          ((VarRef var) texp)
//          from a (VarDecl var texp) declaration.
// @Pre: var is not already in pool - which means
// that all bound variables have been renamed with distinct names.
const extendPoolVarDecl = (vd: A.VarDecl, pool: Pool): Pool =>
    R.prepend({e: A.makeVarRef(vd.var), te: vd.texp}, pool);

export const inPool = (pool: Pool, e: A.Exp): T.TExp | undefined => R.prop('te')(R.find(R.propEq('e', e), pool));

// Map a function over a list of expressions to accumulate
// matching sub-expressions into a pool.
// fun should construct a new pool given a new expression from exp-list
// that has not yet been seen before.
const mapPool = (fun: (e: A.Exp, pool: Pool) => Pool, exps: A.Exp[], result: Pool): Pool =>
    A.isEmpty(exps) ? result :
    mapPool(fun, rest(exps),
            inPool(result, first(exps)) ? result : fun(first(exps), result));

const mapPoolVarDecls = (fun: (e: A.VarDecl, pool: Pool) => Pool, vds: A.VarDecl[], result: Pool): Pool =>
    A.isEmpty(vds) ? result :
    mapPoolVarDecls(fun, rest(vds),
                    inPool(result, A.makeVarRef(first(vds).var)) ? result : fun(first(vds), result));

// Purpose: Traverse the abstract syntax tree L5-exp
//          and collect all sub-expressions into a Pool of fresh type variables.
// Example:
// (ExpToPool parse('(+ x 1)')) =>
// '(((AppExp PrimOp(+) [VarRef(x), NumExp(1)]) TVar(T252722))
//   (NumExp(1) TVar(T252721))
//   (VarRef(x) TVar(T252720))
//   (PrimOp(+) TVar(T252719)))
export const expToPool = (exp: A.Exp): Pool => {
    const findVars = (e: A.Exp, pool: Pool): Pool =>
        A.isAtomicExp(e) ? extendPool(e, pool) :
        A.isProcExp(e) ? extendPool(e, mapPool(findVars, e.body, mapPoolVarDecls(extendPoolVarDecl, e.args, pool))) :
        A.isCompoundExp(e) ? extendPool(e, mapPool(findVars, A.expComponents(e), pool)) :
        makeEmptyPool();
    return findVars(exp, makeEmptyPool());
};

// ========================================================
// Equations ADT
export interface Equation {left: T.TExp, right: T.TExp};
export const makeEquation = (l: T.TExp, r: T.TExp): Equation => ({left: l, right: r});

// Constructor for equations for a Scheme expression:
// this constructor implements the second step of the type-inference-equations
// algorithm -- derive equations for all composite sub expressions of a
// given L5 expression. Its input is a pool of pairs (L5-exp Tvar).
// A Scheme expression is mapped to a pool with L5-exp->pool

// Signature: poolToEquations(pool)
// Purpose: Return a set of equations for a given Exp encoded as a pool
// Type: [Pool -> List(Equation)]
// @Pre: pool is the result of expTopool(exp)
export const poolToEquations = (pool: Pool): Equation[] => {
    // VarRef generate no equations beyond that of var-decl - remove them.
    const poolWithoutVars: Pool = R.filter(R.propSatisfies(R.complement(A.isVarRef), 'e'), pool);
    return R.chain((e: A.Exp) => makeEquationFromExp(e, pool), R.pluck('e', poolWithoutVars));
};

// Signature: make-equation-from-exp(exp, pool)
// Purpose: Return a single equation
// @Pre: exp is a member of pool
export const makeEquationFromExp = (exp: A.Exp, pool: Pool): Equation[] =>
    // The type of procedure is (T1 * ... * Tn -> Te)
    // where Te is the type of the last exp in the body of the proc.
    // and   Ti is the type of each of the parameters.
    // No need to traverse the other body expressions - they will be
    // traversed by the overall loop of pool->equations
    A.isProcExp(exp) ? [makeEquation(inPool(pool, exp),
                                    T.makeProcTExp(R.map((vd) => vd.texp, exp.args),
                                                   inPool(pool, R.last(exp.body))))] :
    // An application must respect the type of its operator
    // Type(Operator) = [T1 * .. * Tn -> Te]
    // Type(Application) = Te
    A.isAppExp(exp) ? [makeEquation(inPool(pool, exp.rator),
                                   T.makeProcTExp(R.map((e) => inPool(pool, e), exp.rands),
                                                  inPool(pool, exp)))] :
    // The type of a number is Number
    A.isNumExp(exp) ? [makeEquation(inPool(pool, exp), T.makeNumTExp())] :
    // The type of a boolean is Boolean
    A.isBoolExp(exp) ? [makeEquation(inPool(pool, exp), T.makeBoolTExp())] :
    // The type of a primitive procedure is given by the primitive.
    A.isPrimOp(exp) ? [makeEquation(inPool(pool, exp), trust(TC.typeofPrim(exp)))] :
    []; // Error(`makeEquationFromExp: Unsupported exp ${exp}`)


// ========================================================
// Signature: inferType(exp)
// Purpose: Infer the type of an expression using the equations method
// Example: unparseTExp(inferType(parse('(lambda (f x) (f (f x)))')))
//          ==> '((T_1 -> T_1) * T_1 -> T_1)'
export const inferType = (exp: A.Exp): T.TExp => {
    // console.log(`Infer ${A.unparse(exp)}`)
    const pool = expToPool(exp);
    // console.log(`Pool ${JSON.stringify(pool)}`);
    const equations = poolToEquations(pool);
    // console.log(`Equations ${JSON.stringify(equations)}`);
    const sub = solveEquations(equations);
    // console.log(`Sub ${JSON.stringify(sub)}`);
    const texp = inPool(pool, exp);
    // console.log(`TExp = ${T.unparseTExp(texp)}`);
    if (T.isTVar(texp) && ! isError(sub))
        return S.subGet(sub, texp);
    else
        return texp;
};

// Type: [Concrete-Exp -> Concrete-TExp]
export const infer = (exp: string): string | Error => {
    const p = A.parse(exp);
    return A.isExp(p) ? safeF(T.unparseTExp)(safeF(inferType)(p)) :
           Error('Unsupported exp: ${p}');
};

// ========================================================
// type equation solving

// Signature: solveEquations(equations)
// Purpose: Solve the type equations and return the resulting substitution
//          or error, if not solvable
// Type: [List(Equation) -> Sub | Error]
// Example: solveEquations(
//            poolToEquations(
//              expToPool(
//                parse('((lambda (x) (x 11)) (lambda (y) y))')))) => sub
export const solveEquations = (equations: Equation[]): S.Sub | Error =>
    solve(equations, S.makeEmptySub());

// Signature: solve(equations, substitution)
// Purpose: Solve the equations, starting from a given substitution.
//          Returns the resulting substitution, or error, if not solvable
const solve = (equations: Equation[], sub: S.Sub): S.Sub | Error => {
    const solveVarEq = (tvar: T.TVar, texp: T.TExp): S.Sub | Error => {
            const sub2 = S.extendSub(sub, tvar, texp);
            return isError(sub2) ? sub2 : solve(rest(equations), sub2);
    };
    const bothSidesAtomic = (eq: Equation): boolean =>
            T.isAtomicTExp(eq.left) && T.isAtomicTExp(eq.right);
    const handleBothSidesAtomic = (eq: Equation): S.Sub | Error =>
            (T.isAtomicTExp(eq.left) && T.isAtomicTExp(eq.right) && T.eqAtomicTExp(eq.left, eq.right)) ?
                solve(rest(equations), sub) :
                Error(`Equation with non-equal atomic type ${eq}`);

    if (A.isEmpty(equations)) return sub;
    const eq = makeEquation(S.applySub(sub, first(equations).left),
                            S.applySub(sub, first(equations).right));
    return T.isTVar(eq.left) ? solveVarEq(eq.left, eq.right) :
           T.isTVar(eq.right) ? solveVarEq(eq.right, eq.left) :
           bothSidesAtomic(eq) ? handleBothSidesAtomic(eq) :
           (T.isCompoundTExp(eq.left) && T.isCompoundTExp(eq.right) && canUnify(eq)) ?
                solve(R.concat(rest(equations), splitEquation(eq)), sub) :
           Error(`Equation contains incompatible types ${eq}`);
};

// Signature: canUnify(equation)
// Purpose: Compare the structure of the type expressions of the equation
const canUnify = (eq: Equation): boolean =>
    T.isProcTExp(eq.left) && T.isProcTExp(eq.right) &&
    (eq.left.paramTEs.length === eq.right.paramTEs.length);

// Signature: splitEquation(equation)
// Purpose: For an equation with unifyable type expressions,
//          create equations for corresponding components.
// Type: [Equation -> List(Equation)]
// Example: splitEquation(
//            makeEquation(parseTExp('(T1 -> T2)'),
//                         parseTExp('(T3 -> (T4 -> T4))')) =>
//            [ {left:T2, right: (T4 -> T4)},
//              {left:T3, right: T1)} ]
// @Pre: isCompoundExp(eq.left) && isCompoundExp(eq.right) && canUnify(eq)
const splitEquation = (eq: Equation): Equation[] =>
    (T.isProcTExp(eq.left) && T.isProcTExp(eq.right)) ?
        R.zipWith(makeEquation,
                  R.prepend(eq.left.returnTE, eq.left.paramTEs),
                  R.prepend(eq.right.returnTE, eq.right.paramTEs)) :
    [];
