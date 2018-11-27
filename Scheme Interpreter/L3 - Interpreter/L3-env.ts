// ========================================================
// Environment data type for L3
import { Value } from './L3-value';

export type Env = EmptyEnv | NonEmptyEnv;
export interface EmptyEnv {tag: "EmptyEnv" };
export interface NonEmptyEnv {
    tag: "Env";
    var: string;
    val: Value;
    nextEnv: Env;
};
export const makeEmptyEnv = (): EmptyEnv => ({tag: "EmptyEnv"});
export const makeEnv = (v: string, val: Value, env: Env): NonEmptyEnv =>
    ({tag: "Env", var: v, val: val, nextEnv: env});
const isEmptyEnv = (x: any): x is EmptyEnv => x.tag === "EmptyEnv";
const isNonEmptyEnv = (x: any): x is NonEmptyEnv => x.tag === "Env";
const isEnv = (x: any): x is Env => isEmptyEnv(x) || isNonEmptyEnv(x);

export const applyEnv = (env: Env, v: string): Value | Error =>
    isEmptyEnv(env) ? Error("var not found " + v) :
    env.var === v ? env.val :
    applyEnv(env.nextEnv, v);

