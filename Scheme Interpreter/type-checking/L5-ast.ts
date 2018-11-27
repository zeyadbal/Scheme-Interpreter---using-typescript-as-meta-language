// ===========================================================
// AST type models for L5
// L5 extends L4 with:
// optional type annotations

import { map, zipWith } from "ramda";
import p = require("s-expression");
import { isClosure, isCompoundSExp, isEmptySExp, isSymbolSExp, makeCompoundSExp, makeEmptySExp, makeSymbolSExp, SExp } from './L5-value';
import { isTVar, makeFreshTVar, parseTExp, unparseTExp, TExp } from './TExp';
import { getErrorMessages, hasNoError, isError, safeF, safeFL } from './error';
import { allT, first, rest, second } from './list';

/*
// =============================================================================
// Examples of type annotated programs
// (define [x : number] 5)
// (define [f : [number -> number]] (lambda ([x : number]) : number (* x x))
// (define [f : [number * number -> number]] (lambda ([x : number] [y : number]) : number (* x x))
// (define f (lambda ([x : number]) (* x x)))  // no type annotation on f and on return value of lambda
// (let (([a : number] 1)
//       ([b : boolean] #t))
//   (if b a (+ a 1)))
// (define [id : (T1 -> T1)] (lambda ([x : T1]) : T1 x))
;;
// The only changes in the syntax of L5 are optional type annotations in var-decl and proc-exp
;;
// <program> ::= (L5 <exp>+)                  / Program(exps:List(exp))
// <exp> ::= <define> | <cexp>                / DefExp | CExp
// <define> ::= ( define <var-decl> <cexp> )  / DefExp(var:VarDecl, val:CExp)
// <var> ::= <identifier>                     / VarRef(var:string)
// <cexp> ::= <number>                        / NumExp(val:number)
//         |  <boolean>                       / BoolExp(val:boolean)
//         |  <string>                        / StrExp(val:string)
//         |  <var-ref>
//         |  ( lambda ( <var-decl>* ) <TExp>* <cexp>+ ) / ProcExp(params:VarDecl[], body:CExp[], returnTE: TExp))
//         |  ( if <cexp> <cexp> <cexp> )     / IfExp(test: CExp, then: CExp, alt: CExp)
//         |  ( quote <sexp> )                / LitExp(val:SExp)
//         |  ( <cexp> <cexp>* )              / AppExp(operator:CExp, operands:CExp[]))
//         |  ( let ( <binding>* ) <cexp>+ )  / LetExp(bindings:Binding[], body:CExp[]))
//         |  ( letrec ( binding*) <cexp>+ )  / LetrecExp(bindings:Bindings[], body: CExp)
//         |  ( set! <var> <cexp>)            / SetExp(var: varRef, val: CExp)
// <binding>  ::= ( <var> <cexp> )            / Binding(var:VarDecl, val:Cexp)
// <prim-op>  ::= + | - | * | / | < | > | = | not |  eq? | string=?
//                  | cons | car | cdr | list? | number?
//                  | boolean? | symbol? | string?
//                  | display | newline
// <num-exp>  ::= a number token
// <bool-exp> ::= #t | #f
// <var-ref>  ::= an identifier token         / VarRef(var)
// <var-decl> ::= an identifier token | (var : TExp) / VarRef(var, TE: TExp) ##### L5
// <sexp>     ::= symbol | number | bool | string | ( <sexp>* )              ##### L3
*/

// A value returned by parseL5
export type Parsed = Exp | Program;

export type Exp = DefineExp | CExp;
export const isExp = (x: any): x is Exp => isDefineExp(x) || isCExp(x);

export type CExp =  AtomicExp | CompoundExp;
export const isCExp = (x: any): x is CExp => isAtomicExp(x) || isCompoundExp(x);

export type AtomicExp = NumExp | BoolExp | StrExp | PrimOp | VarRef;
export const isAtomicExp = (x: any): x is AtomicExp =>
    isNumExp(x) || isBoolExp(x) || isStrExp(x) ||
    isPrimOp(x) || isVarRef(x);

export type CompoundExp = AppExp | IfExp | ProcExp | LetExp | LitExp | LetrecExp | SetExp;
export const isCompoundExp = (x: any): x is CompoundExp =>
    isAppExp(x) || isIfExp(x) || isProcExp(x) || isLitExp(x) || isLetExp(x) || isLetrecExp(x) || isSetExp(x);
export const expComponents = (e: Exp): CExp[] =>
    isIfExp(e) ? [e.test, e.then, e.alt] :
    isProcExp(e) ? e.body :
    isLetExp(e) ? [...e.body, ...map((b) => b.val, e.bindings)] :
    isLetrecExp(e) ? [...e.body, ...map((b) => b.val, e.bindings)] :
    isAppExp(e) ? [e.rator, ...e.rands] :
    isSetExp(e) ? [e.val] :
    isDefineExp(e) ? [e.val] :
    []; // Atomic expressions have no components

// Type definitions
export interface Program {tag: "Program"; exps: Exp[]; };
export const makeProgram = (exps: Exp[]): Program => ({tag: "Program", exps: exps});
export const isProgram = (x: any): x is Program => x.tag === "Program";

export interface DefineExp {tag: "DefineExp"; var: VarDecl; val: CExp; };
export const makeDefineExp = (v: VarDecl, val: CExp): DefineExp =>
    ({tag: "DefineExp", var: v, val: val});
export const isDefineExp = (x: any): x is DefineExp => x.tag === "DefineExp";

export interface NumExp {tag: "NumExp"; val: number; };
export const makeNumExp = (n: number): NumExp => ({tag: "NumExp", val: n});
export const isNumExp = (x: any): x is NumExp => x.tag === "NumExp";

export interface BoolExp {tag: "BoolExp"; val: boolean; };
export const makeBoolExp = (b: boolean): BoolExp => ({tag: "BoolExp", val: b});
export const isBoolExp = (x: any): x is BoolExp => x.tag === "BoolExp";

export interface StrExp {tag: "StrExp"; val: string; };
export const makeStrExp = (s: string): StrExp => ({tag: "StrExp", val: s});
export const isStrExp = (x: any): x is StrExp => x.tag === "StrExp";

export interface PrimOp {tag: "PrimOp"; op: string; };
export const makePrimOp = (op: string): PrimOp => ({tag: "PrimOp", op: op});
export const isPrimOp = (x: any): x is PrimOp => x.tag === "PrimOp";

export interface VarRef {tag: "VarRef"; var: string; };
export const makeVarRef = (v: string): VarRef => ({tag: "VarRef", var: v});
export const isVarRef = (x: any): x is VarRef => x.tag === "VarRef";

export interface VarDecl {tag: "VarDecl"; var: string; texp: TExp};
export const makeVarDecl = (v: string, te: TExp): VarDecl => ({tag: "VarDecl", var: v, texp: te});
export const isVarDecl = (x: any): x is VarDecl => x.tag === "VarDecl";

export interface AppExp {tag: "AppExp"; rator: CExp; rands: CExp[]; };
export const makeAppExp = (rator: CExp, rands: CExp[]): AppExp =>
    ({tag: "AppExp", rator: rator, rands: rands});
export const isAppExp = (x: any): x is AppExp => x.tag === "AppExp";

export interface IfExp {tag: "IfExp"; test: CExp; then: CExp; alt: CExp; };
export const makeIfExp = (test: CExp, then: CExp, alt: CExp): IfExp =>
    ({tag: "IfExp", test: test, then: then, alt: alt});
export const isIfExp = (x: any): x is IfExp => x.tag === "IfExp";

export interface ProcExp {tag: "ProcExp"; args: VarDecl[], body: CExp[]; returnTE: TExp };
export const makeProcExp = (args: VarDecl[], body: CExp[], returnTE: TExp): ProcExp =>
    ({tag: "ProcExp", args: args, body: body, returnTE: returnTE});
export const isProcExp = (x: any): x is ProcExp => x.tag === "ProcExp";

export interface Binding {tag: "Binding"; var: VarDecl; val: CExp; };
export const makeBinding = (v: VarDecl, val: CExp): Binding =>
    ({tag: "Binding", var: v, val: val});
export const isBinding = (x: any): x is Binding => x.tag === "Binding";

export interface LetExp {tag: "LetExp"; bindings: Binding[]; body: CExp[]; };
export const makeLetExp = (bindings: Binding[], body: CExp[]): LetExp =>
    ({tag: "LetExp", bindings: bindings, body: body});
export const isLetExp = (x: any): x is LetExp => x.tag === "LetExp";

export interface LitExp {tag: "LitExp"; val: SExp; };
export const makeLitExp = (val: SExp): LitExp => ({tag: "LitExp", val: val});
export const isLitExp = (x: any): x is LitExp => x.tag === "LitExp";

export interface LetrecExp {tag: "LetrecExp"; bindings: Binding[]; body: CExp[]; };
export const makeLetrecExp = (bindings: Binding[], body: CExp[]): LetrecExp =>
    ({tag: "LetrecExp", bindings: bindings, body: body});
export const isLetrecExp = (x: any): x is LetrecExp => x.tag === "LetrecExp";

export interface SetExp {tag: "SetExp"; var: VarRef; val: CExp; };
export const makeSetExp = (v: VarRef, val: CExp): SetExp =>
    ({tag: "SetExp", var: v, val: val});
export const isSetExp = (x: any): x is SetExp => x.tag === "SetExp";


// ========================================================
// Parsing utilities

export const isEmpty = (x: any): boolean => x.length === 0;
export const isArray = (x: any): boolean => x instanceof Array;
export const isString = (x: any): x is string => typeof x === "string";
export const isNumber = (x: any): x is number => typeof x === "number";
export const isBoolean = (x: any): x is boolean => typeof x === "boolean";

// s-expression returns strings quoted as "a" as [String: 'a'] objects
// to distinguish them from symbols - which are encoded as 'a'
// These are constructed using the new String("a") constructor
// and can be distinguished from regular strings based on the constructor.
export const isSexpString = (x: any): boolean =>
    ! isString(x) && x.constructor && x.constructor.name === "String";
// A weird method to check that a string is a string encoding of a number
export const isNumericString = (x: string): boolean => JSON.stringify(+x) === x;

// ========================================================
// Parsing

export const parse = (x: string): Parsed | Error =>
    parseSexp(p(x));

export const parseSexp = (sexp: any): Parsed | Error =>
    isEmpty(sexp) ? Error("Parse: Unexpected empty") :
    isArray(sexp) ? parseCompound(sexp) :
    isString(sexp) ? parseAtomic(sexp) :
    isSexpString(sexp) ? parseAtomic(sexp) :
    Error(`Parse: Unexpected type ${sexp}`);

export const parseAtomic = (sexp: string): AtomicExp =>
    sexp === "#t" ? makeBoolExp(true) :
    sexp === "#f" ? makeBoolExp(false) :
    isNumericString(sexp) ? makeNumExp(+sexp) :
    isSexpString(sexp) ? makeStrExp(sexp.toString()) :
    isPrimitiveOp(sexp) ? makePrimOp(sexp) :
    makeVarRef(sexp);

/*
    // <prim-op>  ::= + | - | * | / | < | > | = | not |  eq? | string=?
    //                  | cons | car | cdr | list? | number?
    //                  | boolean? | symbol? | string?
*/
const isPrimitiveOp = (x: string): boolean =>
    x === "+" ||
    x === "-" ||
    x === "*" ||
    x === "/" ||
    x === ">" ||
    x === "<" ||
    x === "=" ||
    x === "not" ||
    x === "eq?" ||
    x === "string=?" ||
    x === "cons" ||
    x === "car" ||
    x === "cdr" ||
    x === "list?" ||
    x === "number?" ||
    x === "boolean?" ||
    x === "symbol?" ||
    x === "string?" ||
    x === "display" ||
    x === "newline";

const parseCompound = (sexps: any[]): Parsed | Error =>
    isEmpty(sexps) ? Error("Unexpected empty sexp") :
    (first(sexps) === "L5") ? parseProgram(map(parseSexp, rest(sexps))) :
    (first(sexps) === "define") ? parseDefine(rest(sexps)) :
    parseCExp(sexps);

const parseProgram = (es: Array<Parsed | Error>): Program | Error =>
    isEmpty(es) ? Error("Empty program") :
    allT(isExp, es) ? makeProgram(es) :
    hasNoError(es) ? Error(`Program cannot be embedded in another program - ${es}`) :
    Error(getErrorMessages(es));

const safeMakeDefineExp = (vd: VarDecl | Error, val: CExp | Error): DefineExp | Error =>
    isError(vd) ? vd :
    isError(val) ? val :
    makeDefineExp(vd, val);

const parseDefine = (es: any[]): DefineExp | Error =>
    (es.length !== 2) ? Error(`define should be (define var val) - ${es}`) :
    !isConcreteVarDecl(es[0]) ? Error(`Expected (define <VarDecl> <CExp>) - ${es[0]}`) :
    safeMakeDefineExp(parseVarDecl(es[0]), parseCExp(es[1]));

export const parseCExp = (sexp: any): CExp | Error =>
    isArray(sexp) ? parseCompoundCExp(sexp) :
    isString(sexp) ? parseAtomic(sexp) :
    isSexpString(sexp) ? parseAtomic(sexp) :
    Error("Unexpected type" + sexp);

const parseCompoundCExp = (sexps: any[]): CExp | Error =>
    isEmpty(sexps) ? Error("Unexpected empty") :
    first(sexps) === "if" ? parseIfExp(sexps) :
    first(sexps) === "lambda" ? parseProcExp(sexps) :
    first(sexps) === "let" ? parseLetExp(sexps) :
    first(sexps) === "letrec" ? parseLetrecExp(sexps) :
    first(sexps) === "set!" ? parseSetExp(sexps) :
    first(sexps) === "quote" ? parseLitExp(sexps) :
    parseAppExp(sexps)

const parseAppExp = (sexps: any[]): AppExp | Error =>
    safeFL((cexps: CExp[]) => makeAppExp(first(cexps), rest(cexps)))(map(parseCExp, sexps));

const parseIfExp = (sexps: any[]): IfExp | Error =>
    safeFL((cexps: CExp[]) => makeIfExp(cexps[0], cexps[1], cexps[2]))(map(parseCExp, rest(sexps)));

// (lambda (<vardecl>*) [: returnTE]? <CExp>+)
const parseProcExp = (sexps: any[]): ProcExp | Error => {
    const args: Array<VarDecl | Error> = map(parseVarDecl, sexps[1]);
    const returnTE = (sexps[2] === ":") ? parseTExp(sexps[3]) : makeFreshTVar();
    const body = map(parseCExp, (sexps[2] === ":") ? sexps.slice(4) : sexps.slice(2));
    if (! hasNoError(args))
        return Error(getErrorMessages(args));
    else if (! hasNoError(body))
        return Error(getErrorMessages(body));
    else if (isError(returnTE))
        return Error(`Bad return type: ${returnTE}`);
    else
        return makeProcExp(args, body, returnTE);
}

// LetExp ::= (let (<binding>*) <cexp>+)
const parseLetExp = (sexps: any[]): LetExp | Error =>
    sexps.length < 3 ? Error(`Expected (let (<binding>*) <cexp>+) - ${sexps}`) :
    safeMakeLetExp(parseBindings(sexps[1]),
                   map(parseCExp, sexps.slice(2)));

const safeMakeLetExp = (bindings: Binding[] | Error, body: Array<CExp | Error>): LetExp | Error =>
    isError(bindings) ? bindings :
    hasNoError(body) ? makeLetExp(bindings, body) :
    Error(getErrorMessages(body));

const isConcreteVarDecl = (sexp:  any): boolean =>
    isString(sexp) ||
    (isArray(sexp) && sexp.length > 2 && isString(sexp[0]) && (sexp[1] === ':'));

const safeMakeVarDecl = (v: string, te: TExp | Error): VarDecl | Error =>
    isError(te) ? te :
    makeVarDecl(v, te);

export const parseVarDecl = (x: any): VarDecl | Error =>
    isString(x) ? makeVarDecl(x, makeFreshTVar()) :
    safeMakeVarDecl(x[0], parseTExp(x[2]));

export const parseDecls = (sexps: any[]): Array<VarDecl | Error> =>
    map(parseVarDecl, sexps);

const parseBindings = (pairs: any[]): Binding[] | Error =>
    safeMakeBindings(parseDecls(map(first, pairs)),
                     map(parseCExp, map(second, pairs)));

const safeMakeBindings = (decls: Array<VarDecl | Error>, vals: Array<CExp | Error>): Binding[] | Error =>
    (hasNoError(vals) && hasNoError(decls)) ? zipWith(makeBinding, decls, vals) :
    ! hasNoError(vals) ? Error(getErrorMessages(vals)) :
    Error(getErrorMessages(decls));

// LetrecExp ::= (letrec (<binding>*) <cexp>+)
const parseLetrecExp = (sexps: any[]): LetrecExp | Error =>
    sexps.length < 3 ? Error(`Expected (letrec (<binding>*) <cexp>+) - ${sexps}`) :
    safeMakeLetrecExp(parseBindings(sexps[1]),
                      map(parseCExp, sexps.slice(2)));

const safeMakeLetrecExp = (bindings: Binding[] | Error, body: Array<CExp | Error>): LetrecExp | Error =>
    isError(bindings) ? bindings :
    hasNoError(body) ? makeLetrecExp(bindings, body) :
    Error(getErrorMessages(body));

const parseSetExp = (es: any[]): SetExp | Error =>
    (es.length !== 3) ? Error(`set! should be (set! var val) - ${es}`) :
    !isString(es[1]) ? Error(`Expected (set! <var> <CExp>) - ${es[1]}`) :
    safeF((val: CExp) => makeSetExp(makeVarRef(es[1]), val))(parseCExp(es[2]));

export const parseLitExp = (sexps: any[]): LitExp | Error =>
    safeF(makeLitExp)(parseSExp(second(sexps)));

// x is the output of p (sexp parser)
export const parseSExp = (x: any): SExp | Error =>
    x === "#t" ? true :
    x === "#f" ? false :
    isNumericString(x) ? +x :
    isSexpString(x) ? x.toString() :
    isString(x) ? makeSymbolSExp(x) :
    x.length === 0 ? makeEmptySExp() :
    isArray(x) ? makeCompoundSExp(map(parseSExp, x)) :
    Error(`Bad literal expression: ${x}`);

export const unparse = (e: Parsed | Error): string | Error =>
    isError(e) ? e :
    // NumExp | StrExp | BoolExp | PrimOp | VarRef
    isNumExp(e) ? `${e.val}` :
    isStrExp(e) ? `"${e.val}"` :
    isBoolExp(e) ? (e.val ? "#t" : "#f") :
    isPrimOp(e) ? e.op :
    isVarRef(e) ? e.var :
    // AppExp | IfExp | ProcExp | LetExp | LitExp | LetrecExp | SetExp
    isAppExp(e) ? `(${unparse(e.rator)} ${map(unparse, e.rands).join(" ")})` :
    isIfExp(e) ? `(if ${unparse(e.test)} ${unparse(e.then)} ${unparse(e.alt)})` :
    isLetExp(e) ? `(let (${unparseBinding(e.bindings)}) ${map(unparse, e.body).join(" ")})` :
    isLetrecExp(e) ? `(letrec (${unparseBinding(e.bindings)}) ${map(unparse, e.body).join(" ")})` :
    isProcExp(e) ? `(lambda (${map(unparseVarDecl, e.args).join(" ")})${unparseReturn(e.returnTE)} ${map(unparse, e.body).join(" ")})` :
    isLitExp(e) ? `'${unparseSExp(e.val)}` :
    isSetExp(e) ? `(set! ${e.var} ${unparse(e.val)})` :
    // DefineExp | Program
    isDefineExp(e) ? `(define ${unparseVarDecl(e.var)} ${unparse(e.val)})` :
    `(L5 ${map(unparse, e.exps)})`

const unparseReturn = (te: TExp): string =>
    isTVar(te) ? "" :
    ` : ${unparseTExp(te)}`;

const unparseBinding = (bindings: Binding[]): string =>
    map((b) => `(${unparseVarDecl(b.var)} ${unparse(b.val)})`, bindings).join(" ");

const unparseVarDecl = (vd: VarDecl): string =>
    isTVar(vd.texp) ? vd.var :
    `(${vd.var} : ${unparseTExp(vd.texp)})`;

//  number | boolean | string | PrimOp | Closure | SymbolSExp | EmptySExp | CompoundSExp
const unparseSExp = (s: SExp): string =>
    isEmptySExp(s) ? `()` :
    isSymbolSExp(s) ? s.val :
    isCompoundSExp(s) ? `(${map(unparseSExp, s.val).join(" ")})` :
    isClosure(s) ? `(#Closure)` :
    isPrimOp(s) ? s.op :
    isBoolean(s) ? (s ? "#t" : "#f") :
    `${s}`;
