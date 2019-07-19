import { CharUtil } from "./charstream";
import CharStream = CharUtil.CharStream;
import { ErrorType } from "./Errors/ErrorType";
import { ItemError } from "./Errors/ItemError";
import { CharError } from "./Errors/CharError";
import { SatError } from "./Errors/SatError";
import { DigitError } from "./Errors/DigitError";
import { LetterError } from "./Errors/LetterError";
import { WSError } from "./Errors/WSError";
import { StringError } from "./Errors/StringError";
import { BetweenLeftError } from "./Errors/BetweenLeftError";
import { BetweenRightError } from "./Errors/BetweenRightError";
import { None, Some, Option } from "space-lift";

export namespace Primitives {
    export class EOFMark {
        private static _instance: EOFMark;
        private constructor() { }
        public static get Instance() {
            return this._instance || (this._instance = new this());
        }
    }
    export const EOF = EOFMark.Instance;

    /**
     * Represents an Errors composition function.
     */
    export interface EComposer {
        (f: ErrorType): ErrorType;
    } 

    /**
     * Represents a successful parse.
     */
    export class Success<T> {
        tag: "success" = "success";
        inputstream: CharStream;
        result: T;

        /**
         * Returns an object representing a successful parse.
         * @param istream The remaining string.
         * @param res The result of the parse
         */
        constructor(istream: CharStream, res: T) {
            this.inputstream = istream;
            this.result = res;
        }
    }

    /**
     * Represents a failed parse.
     */
    export class Failure {
        tag: "failure" = "failure";
        inputstream: CharStream;
        error_pos: number;
        error: ErrorType;

        /**
         * Returns an object representing a failed parse.
         *
         * @param istream The string, unmodified, that was given to the parser.
         * @param error_pos The position of the parsing failure in istream
         * @param error The error message for the failure
         */
        constructor(
            istream: CharStream, error_pos: number,
            error: ErrorType
        ) {
            this.inputstream = istream;
            this.error_pos = error_pos;
            this.error = error;
        }
    }

    /**
     * Union type representing a successful or failed parse.
     */
    export type Outcome<T> = Success<T> | Failure;

    /**
     * Generic type of a parser.
     */
    export interface IParser<T> {
        (inputstream: CharStream): Outcome<T>
    }

    /**
     * result succeeds without consuming any input, and returns v.
     * @param v The result of the parse.
     */
    export function result<T>(v: T): IParser<T> {
        return (istream) => {
            return new Success<T>(istream, v);
        }
    }

    /**
     * zero fails without consuming any input.
     * @param expecting the error message.
     */
    export function zero<T>(expecting: string): IParser<T> {
        return (istream) => {
            return new Failure(istream, istream.startpos, new StringError(expecting));
        }
    }

    /**
     * expect tries to apply the given parser and returns the result of that parser
     * if it succeeds, otherwise it replaces the current stream with a stream with
     * modified code given a correct edit, and tries again.
     *
     * @param parser The parser to try
     * @param f A function that produces a new Errors given an existing Errors
     */
    export function expect<T>(parser: IParser<T>) : (f: EComposer) => IParser<T> {
        return (f: EComposer) => {
            return (istream: CharStream) => {
                let outcome: Outcome<T> = parser(istream);
                switch (outcome.tag) {
                    case "success":
                        return outcome;
                    case "failure":
                        //let fail: Failure = new Failure(istream, istream.startpos, f(outcome.error));
                        //let fix = fail.error.minEdit(istream.toString(),fail.error.expectedStr());
                
                        return new Failure(istream, istream.startpos, f(outcome.error));
                }
            }
        };
    }

    /**
     * item successfully consumes the first character if the input
     * string is non-empty, otherwise it fails.
     */
    export function item() {
        return (istream: CharStream) => {
            if (istream.isEmpty()) {
                return new Failure(istream, istream.startpos, new ItemError());
            } else {
                let remaining = istream.tail(); // remaining string;
                let res = istream.head(); // result of parse;
                return new Success(remaining, res);
            }
        }
    }

    /**
     * bind is a curried function that takes a parser p and returns
     * a function that takes a parser f which returns the composition
     * of p and f.  If _any_ of the parsers fail, the original inputstream
     * is returned in the Failure object (i.e., bind backtracks).
     * @param p A parser
     */
    export function bind<T, U>(p: IParser<T>) {
        return (f: (t: T) => IParser<U>) => {
            return (istream: CharStream) => {
                let r = p(istream);
                switch (r.tag) {
                    case "success":
                        let o = f(r.result)(r.inputstream);
                        switch (o.tag) {
                            case "success":
                                break;
                            case "failure": // note: backtracks, returning original istream
                                return new Failure(istream, o.error_pos, o.error);
                        }
                        return o;
                    case "failure":
                        return new Failure(istream, r.error_pos, r.error);
                }
            }
        }
    }

    export function delay<T>(p: IParser<T>) {
        return () => p;
    }

    /**
     * seq is a curried function that takes a parser p, a parser q,
     * and a function f. It applies p to the input, passing the
     * remaining input stream to q; q is then applied.  The function
     * f takes the result of p and q, as a tuple, and returns
     * a single result.
     * @param p A parser
     */
    export function seq<T, U, V>(p: IParser<T>) {
        return (q: IParser<U>) => {
            return (f: (e: [T, U]) => V) => {
                return bind<T, V>(p)((x) => {
                    return bind<U, V>(q)((y) => {
                        let tup: [T, U] = [x, y];
                        return result<V>(f(tup));
                    });
                });
            }
        };
    }

    /**
     * sat takes a predicate and yields a parser that consumes a
     * single character if the character satisfies the predicate,
     * otherwise it fails.
     */
    export function sat(char_class: string[]): IParser<CharStream> {
        let f = (x: CharStream) => {
            return (char_class.indexOf(x.toString()) > -1)
                ? result(x)
                : (istream: CharStream) => new Failure(istream, istream.startpos - 1, new SatError(char_class));
        };
        return bind<CharStream, CharStream>(item())(f);
    }

    /**
     * char takes a character and yields a parser that consume
     * that character. The returned parser succeeds if the next
     * character in the input stream is c, otherwise it fails.
     * @param c
     */
    export function char(c: string): IParser<CharStream> {
        if (c.length != 1) {
            throw new Error("char parser takes a string of length 1 (i.e., a char)");
        }
        return expect(sat([c]))((error : ErrorType) => new CharError(c));
    }

    export function lower_chars() {
        return 'abcdefghijklmnopqrstuvwxyz'.split('');
    }

    export function upper_chars() {
        return 'abcdefghijklmnopqrstuvwxyz'.toUpperCase().split('');
    }

    /**
     * letter returns a parser that consumes a single alphabetic
     * character, from a-z, regardless of case.
     */
    export function letter(): IParser<CharStream> {
        let parser : IParser<CharStream> = sat(lower_chars().concat(upper_chars()));
        return expect(parser)((error : ErrorType) => new LetterError());
    }

    /**
     * digit returns a parser that consumes a single numeric
     * character, from 0-9.  Note that the type of the result
     * is a string, not a number.
     */
    export function digit(): IParser<CharStream> {
        let parser : IParser<CharStream> = sat(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]);
        return expect(parser)((error : ErrorType) => new DigitError());
    }

    /**
     * upper returns a parser that consumes a single character
     * if that character is uppercase.
     */
    export function upper(): IParser<CharStream> {
        return sat(upper_chars());
    }

    /**
     * lower returns a parser that consumes a single character
     * if that character is lowercase.
     */
    export function lower(): IParser<CharStream> {
        return sat(lower_chars());
    }

    /**
     * choice specifies an ordered choice between two parsers,
     * p1 and p2. The returned parser will first apply
     * parser p1.  If p1 succeeds, p1's Outcome is returned.
     * If p1 fails, p2 is applied and the Outcome of p2 is returned.
     *
     * An exception is when an outcome is a critical failure,
     * that outcome is immediately returned.
     *
     * @param p1 A parser.
     */
    export function choice<T>(p1: IParser<T>): (p2: IParser<T>) => IParser<T> {
        return (p2: IParser<T>) => {
            return (istream: CharStream) => {
                let o = p1(istream);
                switch (o.tag) {
                    case "success":
                        return o;
                    case "failure":
                        let o2 = p2(istream);
                        switch (o2.tag) {
                            case "success":
                                break;
                            case "failure":
                                let str = istream.toString()
                                if (o.error_pos == o2.error_pos) {
                                    let str1 = str.substring(o.error_pos, o.error_pos + o.error.expectedStr().length);
                                    let str2 = str.substring(o.error_pos, o.error_pos + o2.error.expectedStr().length);
                            
                                    let o1Edit : number = o.error.minEdit(str1, o.error.expectedStr());
                                    let o2Edit : number = o2.error.minEdit(str2, o2.error.expectedStr());

                                    return (o2Edit < o1Edit) ? o : o2;
                                }

                                return (o2.error_pos > o.error_pos) ? o2 : o
                        }
                        return o2;
                }
            };
        };
    }

    /**
     * Like choice, but chooses from multiple possible parsers
     * First considers the farthest failing error, and if there
     * are multiple, calculate longest common subsequence for each choice, 
     * and returns the maximum LCS
     * Example usage: choices(p1, p2, p3)
     *
     * @param parsers An array of parsers to try
     */
    export function choices<T>(...parsers: IParser<T>[]): IParser<T> {
        let editDist : number[] = [];
        if (parsers.length == 0) {
            throw new Error("Error: choices must have a non-empty array.");
        }
        for(let parser of parsers){
            let lcsVal: number = LCSParse(parser);
            //Force parse each choice parser, holding onto only the LCS value and 
            //store the value into the edits array
        } 
        return parsers[editDist.indexOf(Math.max(...editDist))]
    }

    //performs the force parse, and returns ultimately the LCS length
    function LCSParse<T>(p: IParser<T>, LCS: number = 0): IParser<number> {
        return (istream: CharStream) => {
            let istream2 = istream;
            while (!istream2.isEmpty()) {
                let o = p(istream2);
                switch (o.tag) {
                    case "success":
                        //Keep parsing with next parser
                        LCSParse(item(),LCS)(istream);
                    case "failure":
                        let e = <Failure> o;
                        LCS += e.error.minEdit(istream.toString(), e.error.expectedStr())
                        //calculate LCS, replace istream, and call LCSParse on same parser
                }
            }
            return new Success(istream,LCS);
        }
    }
    /**
     * appfun allows the user to apply a function f to
     * the result of a parser p, assuming that p is successful.
     * @param p A parser.  This is the same as the |>>
     * function from FParsec.
     */
    export function appfun<T, U>(p: IParser<T>) {
        return (f: (t: T) => U) => {
            return (istream: CharStream) => {
                let o = p(istream);
                switch (o.tag) {
                    case "success":
                        return new Success<U>(o.inputstream, f(o.result));
                    case "failure":
                        return o;
                }
            }
        }
    }

    /**
     * many repeatedly applies the parser p until p fails. many always
     * succeeds, even if it matches nothing or if an outcome is critical.
     * many tries to guard against an infinite loop by raising an exception
     * if p succeeds without changing the parser state.
     * @param p The parser to try
     */
    export function many<T>(p: IParser<T>): IParser<T[]> {
        return (istream: CharStream) => {
            let istream2 = istream;
            let outputs: T[] = [];
            let succeeds = true;
            while (!istream2.isEmpty() && succeeds) {
                let o = p(istream2);
                switch (o.tag) {
                    case "success":
                        if (istream2 == o.inputstream) {
                            throw new Error("Parser loops infinitely.");
                        }
                        istream2 = o.inputstream;
                        outputs.push(o.result);
                        break;
                    case "failure":
                        succeeds = false;
                        break;
                }
            }
            return new Success(istream2, outputs);
        }
    }

    /**
     * many1 repeatedly applies the parser p until p fails. many1 must
     * succeed at least once.  many1 tries to guard against an infinite
     * loop by raising an exception if p succeeds without changing the
     * parser state.
     * @param p The parser to try
     */
    export function many1<T>(p: IParser<T>) {
        return (istream: CharStream) => {
            return seq<T, T[], T[]>(p)(many<T>(p))(tup => {
                let hd: T = tup["0"];
                let tl: T[] = tup["1"];
                tl.unshift(hd);
                return tl;
            })(istream);
        };
    }

    /**
     * str yields a parser for the given string.
     * @param s A string
     */
    export function str(s: string): IParser<CharStream> {
        return (istream: CharStream) => {
            let chars: string[] = s.split("");
            let p = result(new CharStream(""));
            let f = (tup: [CharStream, CharStream]) => tup[0].concat(tup[1]);
            for (let c of chars) {
                p = seq<CharStream, CharStream, CharStream>(p)(char(c))(f);
            }
            return expect(p)((error : ErrorType) => new StringError(s))(istream);
        }
    }

    /**
     * Returns a parser that succeeds only if the end of the
     * input has been reached.
     */
    export function eof(): IParser<EOFMark> {
        return (istream: CharStream) => {
            return istream.isEOF() ? new Success(istream, EOF) : new Failure(istream, istream.startpos, new StringError("EOF Error"));
        }
    }

    /**
     * fresult returns a parser that applies the parser p,
     * and if p succeeds, returns the value x.
     * @param p a parser
     */
    export function fresult<T, U>(p: IParser<T>) {
        return (x: U) => {
            return (istream: CharStream) => {
                return bind<T, U>(p)((t: T) => result(x))(istream);
            }
        }
    }

    /**
     * left returns a parser that applies the parser p,
     * then the parser q, and if both are successful,
     * returns the result of p.
     * @param p a parser
     */
    export function left<T, U>(p: IParser<T>) {
        return (q: IParser<U>) => {
            return (istream: CharStream) => {
                return bind<T, T>(p)((t: T) => fresult<U, T>(q)(t))(istream);
            }
        }
    }

    /**
     * right returns a parser that applies the parser p,
     * then the parser q, and if both are successful,
     * returns the result of q.
     * @param p a parser
     */
    export function right<T, U>(p: IParser<T>) {
        return (q: IParser<U>) => {
            return (istream: CharStream) => {
                return bind<T, U>(p)(_ => q)(istream);
            }
        }
    }

    /**
     * between returns a parser that applies the parser
     * popen, p, and pclose in sequence, and if all are
     * successful, returns the result of p.
     * @param popen the first parser
     */
    export function between<T, U, V>(popen: IParser<T>): (pclose: IParser<U>) => (p: IParser<V>) => IParser<V> {
        return (pclose: IParser<U>) => {
            return (p: IParser<V>) => {
                let l: IParser<V> = left<V, U>(p)(expect(pclose)(
                    (error : ErrorType) => new BetweenRightError(error)
                ));

                let r: IParser<V> = right<T, V>(expect(popen)(
                    (error : ErrorType) => new BetweenLeftError(error)
                ))(l);
                return r;
            }
        }
    }

    /**
     * The debug parser takes a parser p and a debug string,
     * printing the debug string as a side-effect before
     * applying p to the input.
     * @param p a parser
     */
    export function debug<T>(p: IParser<T>) {
        return (label: string) => {
            return (istream: CharStream) => {
                ("apply: " + label + ", startpos: " + istream.startpos + ", endpos: " + istream.endpos);
                let o = p(istream);
                switch (o.tag) {
                    case "success":
                        console.log("success: " + label + ", startpos: " + istream.startpos + ", endpos: " + istream.endpos);
                        break;
                    case "failure":
                        console.log("failure: " + label + ", startpos: " + istream.startpos + ", endpos: " + istream.endpos);
                        break;
                }
                return o;
            }
        }
    }

    let wschars: IParser<CharStream> = choice(sat([' ', "\t"]))(nl());

    /**
     * ws matches zero or more of the following whitespace characters:
     * ' ', '\t', '\n', or '\r\n'
     * ws returns matched whitespace in a single CharStream result.
     * Note: ws NEVER fails
     */
    export function ws(): IParser<CharStream> {
        return (istream: CharStream) => {
            let o = many(wschars)(istream);
            switch (o.tag) {
                case "success":
                    return new Success(o.inputstream, CharStream.concat(o.result));
                case "failure":
                    return o;
            }
        }
    }

    /**
     * ws1 matches one or more of the following whitespace characters:
     * ' ', '\t', '\n', or '\r\n'
     * ws1 returns matched whitespace in a single CharStream result.
     */
    export function ws1(): IParser<CharStream> {
        return (istream: CharStream) => {
            let o = expect(many1(wschars))((error: ErrorType) => new WSError())(istream);
            switch (o.tag) {
                case "success":
                    return new Success(o.inputstream, CharStream.concat(o.result));
                case "failure":
                    return o;
            }
        }
    }

    /**
     * nl matches and returns a newline.
     */
    export function nl(): IParser<CharStream> {
        return choice(str("\n"))(str("\r\n"));
    }

    function groupBy<T, U>(list: T[], keyGetter: (e: T) => U): Map<U, T[]> {
        let m: Map<U, T[]> = new Map<U, T[]>();
        list.forEach((item) => {
            const key = keyGetter(item);
            if (!m.has(key)) {
                m.set(key, []);
            }
            let collection = m.get(key)!;
            collection.push(item);
        });
        return m;
    }

    export function strSat(strs: string[]): IParser<CharStream> {
        // sort strings first by length, and then lexicograpically;
        // slice() called here so as not to modify original array
        let smap = groupBy(strs, s => s.length);
        let sizes: number[] = [];
        // find size classes;
        // also sort each set of equivalent-length values
        smap.forEach((vals: string[], key: number, m: Map<number, string[]>) => {
            sizes.push(key);
            vals.sort();
        });
        sizes.sort().reverse();

        return (istream: CharStream) => {
            // start with the smallest size class
            for (let peekIndex = 0; peekIndex < sizes.length; peekIndex++) {
                // for each size class, try matching all of
                // the strings; if one is found, return the
                // appropriate CharStream; if not, fail.
                let peek = istream.peek(sizes[peekIndex]);
                let tail = istream.seek(sizes[peekIndex]);
                let candidates = smap.get(sizes[peekIndex])!;
                for (let cIndex = 0; cIndex < candidates.length; cIndex++) {
                    if (candidates[cIndex] === peek.toString()) {
                        return new Success(tail, peek);
                    }
                }
            }
            return new Failure(istream, istream.startpos, new StringError(<string>istream.substring(istream.startpos, istream.endpos).input));
        }
    }
}
