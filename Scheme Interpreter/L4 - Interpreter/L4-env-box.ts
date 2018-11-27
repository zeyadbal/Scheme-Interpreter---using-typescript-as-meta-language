// Environment for L4 with mutation
// ================================
// An environment represents a partial function from symbols (variable names) to values.
// It supports the operation: apply-env(env,var)
// which either returns the value of var in the environment, or else throws an error.
//
// In L4-env - we saw a first solution supporting the definition of recursive functions with RecEnv / Letrec.
// It provides a solution to support recursion in a good way - but we could not achieve the same behavior as in Scheme
// with define expressions.
// We introduce here a new form of Env which supports mutation and mimics exactly the behavior of Scheme for define and set!.
//
// Box Environment
// ===============
// Represent an environment as a mapping from var to boxes containing values.
// The global environment is the root of all extended environment.
// It contains a frame that is initialized with primitive bindings
// and can be extended with the define operator.
//
// Box-Env is defined inductively by the following cases:
// * <box-env> ::= <global-env> | <extended-box-env>
// * <global-env> ::= (global-env frame) // global-env(frame:Box(Frame))
// * <extended-box-env> ::= (extended-box-env frame enclosing-env)
//      // extended-box-env(frame: Frame, enclosing-env: Box-env)
//
// Frame:
// * <fbinding> ::= (var val) // binding(var:string, val:Box(Value))
// * <frame> ::= (frame (var val)*) // frame(bindings:List(fbinding))
// applyFrame(frame, var) => val
//
// The key operation on env is applyEnv(env, var) which returns the value associated to var in env
// or returns an error if var is not defined in env.

import { map, zipWith } from "ramda";
import { VarDecl } from './L3-ast';
import { CExp4 } from './L4-ast';
import { makeClosure4, Value4 } from './L4-value-box';
import { isError } from "./error";

// ========================================================
// Box datatype
// Encapsulate mutation in a single type.
type Box<T> = T[];
const makeBox = <T>(x: T): Box<T> => ([x]);
const unbox = <T>(b: Box<T>): T => b[0];
const setBox = <T>(b: Box<T>, v: T): void => { b[0] = v; return; }

// ========================================================
// Frame binding
interface FBinding {
    tag: "FBinding";
    var: string;
    val: Box<Value4>;
};

const isFBinding = (x: any): x is FBinding => x.tag === "FBinding";
const makeFBinding = (v: string, val: Value4): FBinding =>
    ({tag: "FBinding", var: v, val: makeBox(val)});
const getFBindingVar = (f: FBinding): string => f.var;
export const getFBindingVal = (f: FBinding): Value4 => unbox(f.val);
export const setFBinding = (f: FBinding, val: Value4): void => { setBox(f.val, val); return; };

// ========================================================
// Frame
interface Frame {
    tag: "Frame";
    fbindings: FBinding[];
};

const makeFrame = (vars: string[], vals: Value4[]): Frame =>
    ({tag: "Frame", fbindings: zipWith(makeFBinding, vars, vals)});
const extendFrame = (frame: Frame, v: string, val: Value4): Frame =>
    ({tag: "Frame", fbindings: [makeFBinding(v, val)].concat(frame.fbindings)});
const isFrame = (x: any): x is Frame => x.tag === "Frame";
const frameVars = (frame: Frame): string[] => map(getFBindingVar, frame.fbindings);
const frameVals = (frame: Frame): Value4[] => map(getFBindingVal, frame.fbindings);

const applyFrame = (frame: Frame, v: string): FBinding | Error => {
    const pos = frameVars(frame).indexOf(v);
    return (pos > -1) ? frame.fbindings[pos] : Error(`Var not found: ${v}`);
};
const setVarFrame = (frame: Frame, v: string, val: Value4): void | Error => {
    const bdg = applyFrame(frame, v);
    return isError(bdg) ? bdg : setFBinding(bdg, val);
}

// ========================================================
// Environment data type
export type Env = GlobalEnv | ExtEnv;
export const isEnv = (x: any): x is Env => isExtEnv(x) || isGlobalEnv(x);

/*
Purpose: lookup the value of var in env and return a mutable binding
Signature: applyEnvBdg(env, var)
Type: [Env * string -> FBinding | Error]
*/
export const applyEnvBdg = (env: Env, v: string): FBinding | Error =>
    isGlobalEnv(env) ? applyGlobalEnvBdg(env, v) :
    isExtEnv(env) ? applyExtEnvBdg(env, v) :
    Error(`Bad env type ${env}`);

/*
Purpose: lookup the value of var in env.
Signature: applyEnv(env, var)
Type: [Env * string -> Value4 | Error]
*/
export const applyEnv = (env: Env, v: string): Value4 | Error => {
    const bdg = applyEnvBdg(env, v);
    return isError(bdg) ? bdg : getFBindingVal(bdg);
}

// ========================================================
// ExtEnv
export interface ExtEnv {
    tag: "ExtEnv";
    frame: Frame;
    env: Env;
};
export const isExtEnv = (x: any): x is ExtEnv => x.tag === "ExtEnv";
export const makeExtEnv = (vs: string[], vals: Value4[], env: Env): ExtEnv =>
    ({tag: "ExtEnv", frame: makeFrame(vs, vals), env: env});
export const ExtEnvVars = (env: ExtEnv): string[] =>
    map(getFBindingVar, env.frame.fbindings);
export const ExtEnvVals = (env: ExtEnv): Value4[] =>
    map(getFBindingVal, env.frame.fbindings);

const applyExtEnvBdg = (env: ExtEnv, v: string): FBinding | Error => {
    const bdg = applyFrame(env.frame, v);
    if (isError(bdg))
        return applyEnvBdg(env.env, v);
    else
        return bdg;
};

// ========================================================
// GlobalEnv
// global-env - has a mutable frame - so that we can add bindings at any time.
interface GlobalEnv {
    tag: "GlobalEnv";
    frame: Box<Frame>;
};
export const isGlobalEnv = (x: any): x is GlobalEnv => x.tag === "GlobalEnv";
const makeGlobalEnv = (): GlobalEnv => ({tag: "GlobalEnv", frame: makeBox(makeFrame([], []))});
// There is a single mutable value in the type Global-env
export const theGlobalEnv = makeGlobalEnv();

const globalEnvSetFrame = (ge: GlobalEnv, f: Frame): void => setBox(ge.frame, f);

export const globalEnvAddBinding = (v: string, val: Value4): void =>
    globalEnvSetFrame(theGlobalEnv,
                      extendFrame(unbox(theGlobalEnv.frame), v, val));

const applyGlobalEnvBdg = (ge: GlobalEnv, v: string): FBinding | Error =>
    applyFrame(unbox(ge.frame), v);
