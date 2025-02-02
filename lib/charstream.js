"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var CharUtil;
(function (CharUtil) {
    class CharStream {
        constructor(s, startpos, endpos, hasEOF) {
            this.hasEOF = true;
            this.input = s;
            if (startpos == undefined) {
                this.startpos = 0; // not specified; set default
            }
            else if (startpos > s.length) {
                this.startpos = s.length; // seek too far; set EOF
            }
            else {
                this.startpos = startpos; // specified and in bounds
            }
            if (endpos == undefined) {
                this.endpos = s.length; // not specified; set default
            }
            else if (endpos > s.length) {
                this.endpos = s.length; // seek too far; set EOF
            }
            else {
                this.endpos = endpos; // specified and in bounds
            }
            if (this.startpos > this.endpos) {
                this.startpos = this.endpos; // if the user flipped positions
            }
            if (hasEOF != undefined) {
                this.hasEOF = hasEOF;
            }
        }
        /**
         * Returns true of the end of the input has been reached.
         */
        isEOF() {
            return this.hasEOF && this.startpos == this.input.length;
        }
        /**
         * Returns a Javscript primitive string of the slice of input
         * represented by this CharStream.
         */
        toString() {
            return this.input.substring(this.startpos, this.endpos);
        }
        /**
         * Returns a new CharStream representing the input from the
         * current start position to an end position num chars from
         * the current start position.  If startpos + num > endpos,
         * the current CharStream is returned.
         * @param num
         */
        peek(num) {
            if (this.startpos + num > this.endpos) {
                return this;
            }
            else {
                let newHasEOF = this.startpos + num == this.endpos && this.hasEOF;
                return new CharStream(this.input, this.startpos, this.startpos + num, newHasEOF);
            }
        }
        /**
         * Returns a new CharStream representing the string after
         * seeking num characters from the current position.
         * @param num
         */
        seek(num) {
            if (this.startpos + num > this.endpos) {
                return new CharStream(this.input, this.endpos, this.endpos, this.hasEOF);
            }
            else {
                return new CharStream(this.input, this.startpos + num, this.endpos, this.hasEOF);
            }
        }
        /**
         * Returns a new CharStream representing the head of the input at
         * the current position.  Throws an exception if the CharStream is
         * empty.
         */
        head() {
            if (!this.isEmpty()) {
                const newHasEOF = this.startpos + 1 == this.endpos && this.hasEOF;
                return new CharStream(this.input, this.startpos, this.startpos + 1, newHasEOF);
            }
            else {
                throw new Error("Cannot get the head of an empty string.");
            }
        }
        /**
         * Returns a new CharStream representing the tail of the input at
         * the current position.  Throws an exception if the CharStream is
         * empty.
         */
        tail() {
            if (!this.isEmpty()) {
                return new CharStream(this.input, this.startpos + 1, this.endpos, this.hasEOF);
            }
            else {
                throw new Error("Cannot get the tail of an empty string.");
            }
        }
        /**
         * Returns true if the input at the current position is empty. Note
         * that a CharStream at the end of the input contains an empty
         * string but that an empty string may not be the end-of-file (i.e.,
         * isEOF is false).
         */
        isEmpty() {
            return this.startpos == this.endpos;
        }
        /**
         * Returns the number of characters remaining at
         * the current position.
         */
        length() {
            return this.endpos - this.startpos;
        }
        /**
         * Returns the substring between start and end at the
         * current position.
         * @param start the start index of the substring, inclusive
         * @param end the end index of the substring, exclusive
         */
        substring(start, end) {
            const start2 = this.startpos + start;
            const end2 = this.startpos + end;
            const newHasEOF = this.endpos == end2 && this.hasEOF;
            return new CharStream(this.input, start2, end2, newHasEOF);
        }
        /**
         * Returns the concatenation of the current CharStream with
         * the given CharStream. Note: returned object does not
         * reuse original input string, and startpos and endpos
         * are reset. If the given CharStream contains EOF, the
         * concatenated CharStream will also contain EOF.
         * @param cs the CharStream to concat to this CharStream
         */
        concat(cs) {
            const s = this.toString() + cs.toString();
            return new CharStream(s, 0, s.length, cs.hasEOF);
        }
        /**
         * replaceCharAt replaces the character at index with the given
         * character
         * @param index
         * @param char
         */
        replaceCharAt(index, char) {
            if (char.length != 1) {
                throw new Error("Char must be a character");
            }
            // if (index > this.endpos) {
            //     throw new Error("Index out of Bound");
            // }
            const s = this.input.substr(0, index) + char + this.input.substr(index + 1);
            return new CharStream(s, this.startpos + 1, this.endpos, this.hasEOF);
        }
        insertCharAt(index, char) {
            if (char.length != 1) {
                throw new Error("Char must be a character");
            }
            const s = this.input.substr(0, index) + char + this.input.substr(index);
            return new CharStream(s, this.startpos + 1, this.endpos + 1, this.hasEOF);
        }
        deleteCharAt(index, char) {
            if (char.length != 1) {
                throw new Error("Char must be a character");
            }
            const s = this.input.substr(0, index) + this.input.substr(index + 1);
            return new CharStream(s, this.startpos, this.endpos - 1, this.hasEOF);
        }
        /**
         * Concatenate an array of CharStream objects into a single
         * CharStream object.
         * @param css a CharStream[]
         */
        static concat(css) {
            if (css.length == 0) {
                return new CharStream("", 0, 0, false);
            }
            else {
                let cs = css[0];
                for (let i = 1; i < css.length; i++) {
                    cs = cs.concat(css[i]);
                }
                return cs;
            }
        }
    }
    CharUtil.CharStream = CharStream;
})(CharUtil = exports.CharUtil || (exports.CharUtil = {}));
//# sourceMappingURL=charstream.js.map