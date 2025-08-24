import { Rule } from '@angular-devkit/schematics';
export interface Options {
    name: string;
    moduleName?: string;
    directory?: string;
    module?: string;
    path?: string;
}
export declare function handlerSchematic(opts: Options): Rule;
