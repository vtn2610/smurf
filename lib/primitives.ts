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
import { metriclcs, edit } from "./Edit/MetricLcs";
import { parser } from "marked";

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
            return new Failure(istream, istream.startpos, new StringError(expecting,0, new CharStream("")));
        }
    }

    export function minEdit(input : string, expectedStr : string) {
        return metriclcs(input, expectedStr);
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
                        let newError = f(outcome.error);
                        let windowSize = newError.expectedStr().length;
                        let inputBound = istream.input.substring(outcome.error_pos, outcome.error_pos + windowSize);
                        let editsSet = minEdit(inputBound, newError.expectedStr());
                        
                        let edits : [number, CharStream] = editParse(parser, istream, outcome.error.edit, windowSize, outcome.error_pos, outcome.error_pos, editsSet);
                        //console.log("new Char");
                        //console.log(edits[1]);
                        console.log("edits[0]: " + edits[0])
                        newError.edit = edits[0];
                        console.log("error pos" + outcome.error_pos)
                        let newStream = edits[1].seek(outcome.error_pos);
                        newError.modString = newStream;
                        console.log("new STREAM" + newStream);
                        
                        return new Failure(newStream, istream.startpos, newError);
                }
            }
        };
    }

    /**
     * item successfully consumes the first character if the input
     * string is non-empty, otherwise it fails.
     */
    function _item() {
        return (istream: CharStream) => {
            if (istream.isEmpty()) {
                return new Failure(istream, istream.startpos, new ItemError(0, new CharStream("")));
            } else {
                let remaining = istream.tail(); // remaining string;
                let res = istream.head(); // result of parse;
                return new Success(remaining, res);
            }
        }
    }

    export function item() {
        return expect(_item())((error : ErrorType) => error);
    }

    /**
     * bind is a curried function that takes a parser p and returns
     * a function that takes a parser f which returns the composition
     * of p and f.  If _any_ of the parsers fail, the original inputstream
     * is returned in the Failure object (i.e., bind backtracks).
     * @param p A parser
     */
    // export function bind<T, U>(p: IParser<T>) {
    //     return (f: (t: T) => IParser<U>) => {
    //         return (istream: CharStream) => {
    //             let r = p(istream);
    //             switch (r.tag) {
    //                 case "success":
    //                     let o = f(r.result)(r.inputstream);
    //                     switch (o.tag) {
    //                         case "success":
    //                         // case 1: both parsers succeeds
    //                             break;
    //                         case "failure": // note: backtracks, returning original istream
    //                         // case 2: parser 1 succeeds, 2 fails
    //                             return new Failure(istream, o.error_pos, o.error);
    //                     }
    //                     return o;
    //                 case "failure":
    //                     //apply parser again with modified inputstream;
    //                     return new Failure(istream, r.error_pos, r.error);
    //             }
    //         }
    //     }
    // }

    export function bind<T, U>(p: IParser<T>) {
        return (f: (t: T) => IParser<U>) => {
            return (istream: CharStream) => {
                let r = p(istream);
                switch (r.tag) {
                    case "success":
                        let o = f(r.result)(r.inputstream);
                        switch (o.tag) {
                            case "success":
                            // case 1: both parsers succeeds
                                break;
                            case "failure": // note: backtracks, returning original istream
                            // case 2: parser 1 succeeds, 2 fails
                                return new Failure(o.error.modString, o.error_pos, o.error);
                        }
                        return o;
                    case "failure":
                        console.log("it's checking failure case");
                        //apply parser again with modified inputstream;
                        console.log(r.error.modString);
                        let r2 = p(r.error.modString);
                        if (r2 instanceof Success) {
                            let o2 = f(r2.result)(r2.inputstream);
                            switch (o2.tag) {
                                case "success": 
                                //case 3: parser 1 fails, 2 succeeds
                                    break;
                                case "failure": 
                                // case 4: both parsers fail
                                    o2.error.cause = r.error;
                                    return new Failure(o2.error.modString, o2.error_pos, o2.error);
                            }
                        }
                        return new Failure(r.error.modString, r.error_pos, r.error);
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
                    console.log("first parser result" + x);
                    return bind<U, V>(q)((y) => {
                        console.log("second parser result" + y);
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
    function _sat(char_class: string[]): IParser<CharStream> {
        let f = (x: CharStream) => {
            return (char_class.indexOf(x.toString()) > -1)
                ? result(x)
                : (istream: CharStream) => new Failure(istream, istream.startpos - 1, new SatError(char_class, 0, new CharStream("")));
        };
        return bind<CharStream, CharStream>(_item())(f);
    }

    export function sat(char_class: string[]): IParser<CharStream>{
        return expect(_sat(char_class))((error : ErrorType) => error);
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
        return expect(_sat([c]))((error : ErrorType) => new CharError(c, error.edit, error.modString));
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
        let parser : IParser<CharStream> = _sat(lower_chars().concat(upper_chars()));
        return expect(parser)((error : ErrorType) => new LetterError(error.edit, new CharStream("")));
    }

    /**
     * digit returns a parser that consumes a single numeric
     * character, from 0-9.  Note that the type of the result
     * is a string, not a number.
     */
    export function digit(): IParser<CharStream> {
        let parser : IParser<CharStream> = _sat(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]);
        return expect(parser)((error : ErrorType) => new DigitError(error.edit, new CharStream("")));
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
                                //Get the failure object from both parsers
                                let o1Fail = (<Failure>expect(p1)((error : ErrorType)  => error)(istream));
                                let o2Fail = (<Failure>expect(p1)((error : ErrorType) => error)(istream));
                                
                                //Get the edit distance from both failures
                                let o1Edit = o1Fail.error.edit;
                                let o2Edit = o2Fail.error.edit;

                                if (o2Edit > o1Edit){
                                    // p1 has the smallest edit distance
                                    //console.log("choice: "+ o1Edit)
                                    return new Failure(o1Fail.inputstream, o.error_pos, o.error);
                                } else {
                                    // p2 has the smallest edit distance
                                    //console.log("choice2: " + o2Edit)
                                    return new Failure(o2Fail.inputstream, o2.error_pos, o2.error);
                                }
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
        if (parsers.length == 0) {
            throw new Error("Error: choices must have a non-empty array.");
        }

        return (parsers.length > 1)
            ? choice<T>(parsers[0])(choices<T>(...parsers.slice(1)))
            : parsers[0];
        
    }
    //performs the force parse, and returns ultimately the LCS length
    export function editParse<T>(p: IParser<T>, istream : CharStream, LCS: number, windowSize : number, orgErrorPos : number, curErrorPos : number, edits: edit[]): [number,CharStream] {
        let o = p(istream);
        let string = istream.input;
        switch (o.tag) {
            case "success":
                break; //Keep parsing with next parser
            case "failure":
                let e = <Failure> o;
                curErrorPos = e.error_pos;
                //let maxEdit : number = edits.length;
                while (edits.length > 0) {
                    let curEdit : edit | undefined = edits.shift();
                    // case of insertion
                    if (curEdit !== undefined && curEdit.sign === true) { 
                        if (edits[0] !== undefined && edits[0].pos == curEdit.pos && edits[0].sign === false) {
                            // case of replacement
                            let replace = edits.shift();
                            if (replace !== undefined) string = string.substring(0, curErrorPos + curEdit.pos) + curEdit.char + string.substring(curErrorPos + curEdit.pos + 1);
                                LCS += 2;
                        } else {
                            string = string.substring(0, curErrorPos + curEdit.pos) + curEdit.char + string.substring(curErrorPos + curEdit.pos);
                            for (let item of edits) {
                                item.pos++;
                            }
                            LCS++;
                            windowSize++;
                        }
                    // case of deletion
                    } else if (curEdit !== undefined && curEdit.sign === false) {
                        string = string.substring(0, curErrorPos + curEdit.pos) + string.substring(curErrorPos + curEdit.pos + 1);
                        for (let item of edits) {
                            item.pos--;
                        }
                        LCS++;
                        windowSize--;
                    }
                    if (p(new CharStream(string)).tag == "success") {break}
                }        
            }
        return [LCS, new CharStream(string)];
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
            return expect(seq<T, T[], T[]>(p)(many<T>(p))(tup => {
                let hd: T = tup["0"];
                let tl: T[] = tup["1"];
                tl.unshift(hd);
                return tl;
            }))((error : ErrorType)  => error)(istream);
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
            return expect(p)((error : ErrorType) => new StringError(s,error.edit, new CharStream("")))(istream);
        }
    }

    /**
     * Returns a parser that succeeds only if the end of the
     * input has been reached.
     */
    export function eof(): IParser<EOFMark> {
        return (istream: CharStream) => {
            return istream.isEOF() ? new Success(istream, EOF) : new Failure(istream, istream.startpos, new StringError("EOF", istream.length(), new CharStream("")));
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
                    (error : ErrorType) => {
                        console.log(error);
                        console.log(error.edit);
                        return new BetweenRightError(error, error.edit, new CharStream(""))
                    }
                ));

                let r: IParser<V> = right<T, V>(expect(popen)(
                    (error : ErrorType) => new BetweenLeftError(error, error.edit, new CharStream(""))
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

    let wschars: IParser<CharStream> = choice(_sat([' ', "\t"]))(nl());

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
            let o = expect(many1(wschars))((error: ErrorType) => new WSError(error.edit, new CharStream("")))(istream);
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
            return new Failure(istream, istream.startpos, new StringError(<string>istream.substring(istream.startpos, istream.endpos).input,0, new CharStream("")));
        }
    }
}
