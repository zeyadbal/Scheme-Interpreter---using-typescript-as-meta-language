// L4-eval.ts

import { filter, map, reduce, zip } from "ramda";
import { isArray, isBoolean, isEmpty, isNumber, isString } from "./L3-ast";
import { AtomicExp, BoolExp, LitExp, NumExp, PrimOp, StrExp, VarDecl, VarRef } from "./L3-ast";
import { isBoolExp, isLitExp, isNumExp, isPrimOp, isStrExp, isVarRef } from "./L3-ast";
import { makeAppExp, makeBoolExp, makeIfExp, makeLitExp, makeNumExp, makeProcExp, makeStrExp,
         makeVarDecl, makeVarRef } from "./L3-ast";
import { isEmptySExp, isSymbolSExp, makeEmptySExp, makeSymbolSExp } from './L3-value';
import { AppExp4, CompoundExp4, CExp4, DefineExp4, Exp4, IfExp4, LetrecExp4, LetExp4, Parsed4, ProcExp4, Program4 } from './L4-ast';
import { isAppExp4, isCExp4, isDefineExp4, isExp4, isIfExp4, isLetrecExp4, isLetExp4, isLitExp4, isProcExp4, isProgram4 } from "./L4-ast";
import { parseL4 } from "./L4-ast";
import { applyEnv, makeEmptyEnv, makeExtEnv, makeRecEnv, Env } from "./L4-env";
import { isClosure4, isCompoundSExp4, isSExp4, makeClosure4, makeCompoundSExp4,
         Closure4, CompoundSExp4, SExp4, Value4 } from "./L4-value";
import { getErrorMessages, hasNoError, isError }  from "./error";
import { allT, first, rest, second } from './list';

// ========================================================
// Eval functions

const L4applicativeEval = (exp: CExp4 | Error, env: Env): Value4 | Error =>
    isError(exp)  ? exp :
    isNumExp(exp) ? exp.val :
    isBoolExp(exp) ? exp.val :
    isStrExp(exp) ? exp.val :
    isPrimOp(exp) ? exp :
    isVarRef(exp) ? applyEnv(env, exp.var) :
    isLitExp4(exp) ? exp.val :
    isIfExp4(exp) ? evalIf4(exp, env) :
    isProcExp4(exp) ? evalProc4(exp, env) :
    isLetExp4(exp) ? evalLet4(exp, env) :
    isLetrecExp4(exp) ? evalLetrec4(exp, env) :
    isAppExp4(exp) ? L4applyProcedure(L4applicativeEval(exp.rator, env),
                                      map((rand) => L4applicativeEval(rand, env),
                                          exp.rands)) :
    Error(`Bad L4 AST ${exp}`);

export const isTrueValue = (x: Value4 | Error): boolean | Error =>
    isError(x) ? x :
    ! (x === false);

const evalIf4 = (exp: IfExp4, env: Env): Value4 | Error => {
    const test = L4applicativeEval(exp.test, env);
    return isError(test) ? test :
        isTrueValue(test) ? L4applicativeEval(exp.then, env) :
        L4applicativeEval(exp.alt, env);
};

const evalProc4 = (exp: ProcExp4, env: Env): Closure4 =>
    makeClosure4(exp.args, exp.body, env);

// @Pre: none of the args is an Error (checked in applyProcedure)
// KEY: This procedure does NOT have an env parameter.
//      Instead we use the env of the closure.
const L4applyProcedure = (proc: Value4 | Error, args: Array<Value4 | Error>): Value4 | Error =>
    isError(proc) ? proc :
    !hasNoError(args) ? Error(`Bad argument: ${getErrorMessages(args)}`) :
    isPrimOp(proc) ? applyPrimitive(proc, args) :
    isClosure4(proc) ? applyClosure4(proc, args) :
    Error(`Bad procedure ${JSON.stringify(proc)}`);

const applyClosure4 = (proc: Closure4, args: Value4[]): Value4 | Error => {
    let vars = map((v: VarDecl) => v.var, proc.params);
    return evalExps(proc.body, makeExtEnv(vars, args, proc.env));
}

// Evaluate a sequence of expressions (in a program)
export const evalExps = (exps: Exp4[], env: Env): Value4 | Error =>
    isEmpty(exps) ? Error("Empty program") :
    isDefineExp4(first(exps)) ? evalDefineExps4(exps, env) :
    isEmpty(rest(exps)) ? L4applicativeEval(first(exps), env) :
    isError(L4applicativeEval(first(exps), env)) ? Error("error") :
    evalExps(rest(exps), env);

// Eval a sequence of expressions when the first exp is a Define.
// Compute the rhs of the define, extend the env with the new binding
// then compute the rest of the exps in the new env.
const evalDefineExps4 = (exps: Exp4[], env): Value4 | Error => {
    let def = first(exps);
    let rhs = L4applicativeEval(def.val, env);
    if (isError(rhs))
        return rhs;
    else {
        let newEnv = makeExtEnv([def.var.var], [rhs], env);
        return evalExps(rest(exps), newEnv);
    }
}

// LET: Direct evaluation rule without syntax expansion
// compute the values, extend the env, eval the body.
const evalLet4 = (exp: LetExp4, env: Env): Value4 | Error => {
    const vals = map((v) => L4applicativeEval(v, env), map((b) => b.val, exp.bindings));
    const vars = map((b) => b.var.var, exp.bindings);
    if (hasNoError(vals)) {
        return evalExps(exp.body, makeExtEnv(vars, vals, env));
    } else {
        return Error(getErrorMessages(vals));
    }
}

// LETREC: Direct evaluation rule without syntax expansion
// prepare the values as a RecEnv, eval the body (no eval needed for the vals).
const evalLetrec4 = (exp: LetrecExp4, env: Env): Value4 | Error => {
    const vars = map((b) => b.var.var, exp.bindings);
    const vals = map((b) => b.val, exp.bindings);
    if (allT(isProcExp4, vals)) {
        const paramss = map((v) => v.args, vals);
        const bodies = map((v) => v.body, vals);
        return evalExps(exp.body, makeRecEnv(vars, paramss, bodies, env));
    } else {
        return Error("Letrec: all variables must be bound to procedures");
    }
}

// ========================================================
// Primitives

// @Pre: none of the args is an Error (checked in applyProcedure)
export const applyPrimitive = (proc: PrimOp, args: Value4[]): Value4 | Error =>
    proc.op === "+" ? (allT(isNumber, args) ? reduce((x, y) => x + y, 0, args) : Error("+ expects numbers only")) :
    proc.op === "-" ? minusPrim(args) :
    proc.op === "*" ? (allT(isNumber, args) ? reduce((x, y) => x * y, 1, args) : Error("* expects numbers only")) :
    proc.op === "/" ? divPrim(args) :
    proc.op === ">" ? args[0] > args[1] :
    proc.op === "<" ? args[0] < args[1] :
    proc.op === "=" ? args[0] === args[1] :
    proc.op === "not" ? ! args[0] :
    proc.op === "eq?" ? eqPrim(args) :
    proc.op === "string=?" ? args[0] === args[1] :
    proc.op === "cons" ? consPrim(args[0], args[1]) :
    proc.op === "car" ? carPrim(args[0]) :
    proc.op === "cdr" ? cdrPrim(args[0]) :
    proc.op === "list?" ? isListPrim(args[0]) :
    proc.op === "number?" ? typeof(args[0]) === 'number' :
    proc.op === "boolean?" ? typeof(args[0]) === 'boolean' :
    proc.op === "symbol?" ? isSymbolSExp(args[0]) :
    proc.op === "string?" ? isString(args[0]) :
    Error("Bad primitive op " + proc.op);

const minusPrim = (args: Value4[]): number | Error => {
    // TODO complete
    let x = args[0], y = args[1];
    if (isNumber(x) && isNumber(y)) {
        return x - y;
    } else {
        return Error(`Type error: - expects numbers ${args}`)
    }
}

const divPrim = (args: Value4[]): number | Error => {
    // TODO complete
    let x = args[0], y = args[1];
    if (isNumber(x) && isNumber(y)) {
        return x / y;
    } else {
        return Error(`Type error: / expects numbers ${args}`)
    }
}

const eqPrim = (args: Value4[]): boolean | Error => {
    let x = args[0], y = args[1];
    if (isSymbolSExp(x) && isSymbolSExp(y)) {
        return x.val === y.val;
    } else if (isEmptySExp(x) && isEmptySExp(y)) {
        return true;
    } else if (isNumber(x) && isNumber(y)) {
        return x === y;
    } else if (isString(x) && isString(y)) {
        return x === y;
    } else if (isBoolean(x) && isBoolean(y)) {
        return x === y;
    } else {
        return false;
    }
}

const carPrim = (v: Value4): Value4 | Error =>
    isCompoundSExp4(v) ? first(v.val) :
    Error(`Car: param is not compound ${v}`);

const cdrPrim = (v: Value4): Value4 | Error =>
    isCompoundSExp4(v) ?
        ((v.val.length > 1) ? makeCompoundSExp4(rest(v.val)) : makeEmptySExp()) :
    Error(`Cdr: param is not compound ${v}`);

const consPrim = (v: Value4, lv: Value4): CompoundSExp4 | Error =>
    isEmptySExp(lv) ? makeCompoundSExp4([v]) :
    isCompoundSExp4(lv) ? makeCompoundSExp4([v].concat(lv.val)) :
    Error(`Cons: 2nd param is not empty or compound ${lv}`);

const isListPrim = (v: Value4): boolean =>
    isEmptySExp(v) || isCompoundSExp4(v);


// Main program
export const evalL4program = (program: Program4): Value4 | Error =>
    evalExps(program.exps, makeEmptyEnv());

export const evalParse4 = (s: string): Value4 | Error => {
    let ast: Parsed4 | Error = parseL4(s);
    if (isProgram4(ast)) {
        return evalL4program(ast);
    } else if (isExp4(ast)) {
        return evalExps([ast], makeEmptyEnv());
    } else {
        return ast;
    }
}
