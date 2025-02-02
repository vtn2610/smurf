import { Option, Some, None, tuple} from 'space-lift';
import { ErrorType } from "./ErrorType";
import { edit } from "../Edit/MetricLcs";
import { CharUtil } from "../charstream"
import CharStream = CharUtil.CharStream;
import { totalmem } from 'os';
import { AbstractError } from './AbstractError';
import { Primitives } from '../primitives';
import Success = Primitives.Success;

export class StringError extends AbstractError {

    private _expectedStr : string;

    constructor(rootCauses : ErrorType[], expectedStr : string) {
        super();
        this._expectedStr = expectedStr;
        this._rootCauses = Some(rootCauses);
    }

    get expectedStr() : string{
        return this._expectedStr;
    } 

    explanation() {
        return "character " + " ' " + this._expectedStr + " ' "; 
    }

    toString() : string {
        return "CharError -> " + " ' " + this._expectedStr + " ' "; 
    }
}