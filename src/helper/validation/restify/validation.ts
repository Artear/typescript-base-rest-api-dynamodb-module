import {Next, Request, Response} from "restify";
import {NotAcceptableError, UnprocessableEntityError} from "restify-errors";
import * as Joi from "joi";

export namespace RestifyValidation {
    /**
     * @param field
     * @returns {(target:Object, key:string, descriptor:TypedPropertyDescriptor<any>)=>TypedPropertyDescriptor<any>}
     */
    export function isAlphanumeric(field: string) {
        return Validator.paramValidation(
            (params: Object): boolean => {
                return params[field].match(/^[a-z0-9\-_]+$/i) !== null;
            },
            new NotAcceptableError("The " + field + " must be alphanumeric")
        );
    }

    export function isNumeric(field: string) {

        return Validator.paramValidation(
            (params: Object): boolean => {
                return params[field].match(/^\d+$/) !== null;
            },
            new NotAcceptableError("The " + field + " must be numeric")
        );
    }

    /**
     * @param bodySchema
     * @returns {(target:Object, key:string, descriptor:TypedPropertyDescriptor<any>)=>TypedPropertyDescriptor<any>}
     */
    export function validateBodyWithSchema(bodySchema) {
        return function (target: Object, key: string, descriptor: TypedPropertyDescriptor<any>) {
            if (descriptor === undefined) {
                descriptor = Object.getOwnPropertyDescriptor(target, key);
            }
            let originalMethod = descriptor.value;
            descriptor.value = function (req: Request, res: Response, next: Next) {

                if (req.params === false) {
                    res.send(new NotAcceptableError("Body params can't be undefined"));
                } else {
                    Joi.validate(req.params, bodySchema, function (err, value) {
                        if (!!err) {
                            res.send(new UnprocessableEntityError(err.details[0].message));
                        } else {
                            let args: Array<any> = [req, res, next];
                            originalMethod.apply(this, args);
                        }
                    });
                }
            };
            return descriptor;
        };
    }

    export class Validator {
        /**
         * @param validation
         * @param message
         * @returns {(target:Object, key:string, descriptor:TypedPropertyDescriptor<any>)=>TypedPropertyDescriptor<any>}
         */

        static paramValidation(validation: Function, message: string | Object | Error) {
            return function (target: Object, key: string, descriptor: TypedPropertyDescriptor<any>) {
                if (descriptor === undefined) {
                    descriptor = Object.getOwnPropertyDescriptor(target, key);
                }
                let originalMethod = descriptor.value;
                descriptor.value = function (req: Request, res: Response, next: Next) {
                    if (validation(req.params) === false) {
                        res.send(message);
                    } else {
                        let args: Array<any> = [req, res, next];
                        originalMethod.apply(this, args);
                    }
                };
                return descriptor;
            };
        }
    }
}
