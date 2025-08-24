import { Rule } from '@angular-devkit/schematics';
export interface Options {
    name: string;
    moduleName?: string;
    directory?: string;
    path?: string;
}
export declare function eventSchematic(opts: Options): Rule;
