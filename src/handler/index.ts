import {
    Rule,
    SchematicContext,
    Tree,
    apply,
    url,
    template,
    move,
    chain,
    mergeWith,
    forEach,
    FileEntry,
} from '@angular-devkit/schematics';
import { strings, normalize } from '@angular-devkit/core';
import { insertImport } from '@schematics/angular/utility/ast-utils';
import { buildRelativePath } from '@schematics/angular/utility/find-module';
// TS "vendored" do @schematics/angular para evitar conflitos de tipos
import * as ts from '@schematics/angular/third_party/github.com/Microsoft/TypeScript/lib/typescript';
import { InsertChange } from '@schematics/angular/utility/change';

export interface Options {
    name: string;        // event name (ex.: process.reconciliation.completed)
    moduleName?: string; // logical module name (cai para --path se vier do Nest CLI)
    directory?: string;  // override opcional
    module?: string;     // override opcional
    path?: string;       // injetado pelo Nest CLI em alguns cenários
}

/** 'process-actor.reconciliation.completed' -> 'ProcessActorReconciliationCompletedHandler' */
function toClassName(eventName: string): string {
    const parts = eventName.split(/[.-]/g).filter(Boolean);
    return parts.map((p) => strings.classify(p)).join('') + 'Handler';
}

/** Converte qualquer formato para kebab-case; preserva hífens existentes */
function toKebab(name: string): string {
    if (!name) return '';
    if (name.includes('-')) return name.toLowerCase();
    return name
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .replace(/[_\s]+/g, '-')
        .toLowerCase();
}

/** Garante path absoluto no FS virtual do Schematics (começa por '/') */
function toAbsPath(p: string): string {
    const clean = p.replace(/\/+$/, '');
    return normalize(clean.startsWith('/') ? clean : `/${clean}`) as unknown as string;
}

/** Source transform: remove o sufixo ".template" de todos os ficheiros do template. */
function removeTemplateSuffix() {
    return forEach((entry: FileEntry) => {
        if (entry.path.endsWith('.template')) {
            return {
                content: entry.content,
                path: entry.path.slice(0, -'.template'.length),
            } as FileEntry;
        }
        return entry;
    });
}

export function handlerSchematic(opts: Options): Rule {
    return (tree: Tree, _context: SchematicContext) => {
        const eventName = (opts.name || '').trim();
        if (!eventName) throw new Error('Parâmetro "name" (evento) é obrigatório.');

        // aceitar moduleName OU path (o Nest CLI pode injetar --path)
        const rawModuleName = (opts.moduleName ?? opts.path ?? '').toString().trim();
        if (!rawModuleName) {
            throw new Error(
                'Indica o nome do módulo (2º argumento) ou --moduleName / --path. Ex.: handler process.reconciliation.completed process-actors'
            );
        }

        const moduleKebab = toKebab(rawModuleName);

        // inferências relativas
        const directoryRel = (opts.directory?.trim() || `src/${moduleKebab}`).replace(/\/+$/, '');
        const modulePathRel = (opts.module?.trim() || `${directoryRel}/${moduleKebab}.module.ts`).replace(/\/+$/, '');

        // absolutos
        const directoryAbs = toAbsPath(directoryRel);
        const modulePathAbs = toAbsPath(modulePathRel);
        const targetDirAbs = toAbsPath(`${directoryAbs}/events`);
        const fileBase = eventName; // mantém '.' e '-'
        const targetPathAbs = toAbsPath(`${targetDirAbs}/${fileBase}.handler.ts`);

        // validações
        if (!tree.exists(modulePathAbs)) throw new Error(`Módulo não encontrado: ${modulePathAbs}`);
        if (tree.exists(targetPathAbs)) throw new Error(`O handler já existe: ${targetPathAbs}`);

        // 1) gerar ficheiro do handler
        const className = toClassName(eventName);
        const generateFile = mergeWith(
            apply(url('./files'), [
                template({ ...strings, className, eventName, fileBase }),
                removeTemplateSuffix(), // <-- renomeia *.template -> sem sufixo
                move(targetDirAbs),
            ])
        );

        // 2) atualizar o módulo (import + providers)
        const updateModule: Rule = (treeInner: Tree) => {
            const sourceText = treeInner.read(modulePathAbs)!.toString('utf-8');
            const sourceFile = ts.createSourceFile(modulePathAbs, sourceText, ts.ScriptTarget.Latest, true);

            // caminho de import relativo SEM .ts
            const relativePath = buildRelativePath(modulePathAbs, targetPathAbs).replace(/\.ts$/, '');

            // inserir import (no topo)
            const importChange = insertImport(sourceFile, modulePathAbs, className, relativePath) as InsertChange;

            // localizar @Module({ ... })
            const moduleDecoIdx = sourceText.indexOf('@Module(');
            if (moduleDecoIdx < 0) throw new Error('Decorator @Module não encontrado no ficheiro do módulo.');

            const objStart = sourceText.indexOf('{', moduleDecoIdx);
            if (objStart < 0) throw new Error('Objeto de metadata do @Module não encontrado.');

            // encontrar '}' correspondente ao '{' acima
            let brace = 1;
            let i = objStart + 1;
            while (i < sourceText.length && brace > 0) {
                const ch = sourceText[i++];
                if (ch === '{') brace++;
                else if (ch === '}') brace--;
            }
            const objEnd = i - 1;
            if (objEnd <= objStart) throw new Error('Falha ao localizar o fecho do objeto do @Module.');

            // preparar update recorder
            const recorder = treeInner.beginUpdate(modulePathAbs);

            // aplicar import
            if (importChange.toAdd) recorder.insertLeft(importChange.pos, importChange.toAdd);

            // detetar se já existe 'providers: [...]'
            const meta = sourceText.slice(objStart, objEnd);
            const providersKeyRelIdx = meta.search(/providers\s*:/);

            if (providersKeyRelIdx >= 0) {
                // já existe providers
                const absProvidersKeyIdx = objStart + providersKeyRelIdx;
                const arrayStart = sourceText.indexOf('[', absProvidersKeyIdx);
                const arrayEnd = sourceText.indexOf(']', arrayStart);
                if (arrayStart < 0 || arrayEnd < 0) {
                    throw new Error('Estrutura de providers inesperada no @Module.');
                }
                const between = sourceText.slice(arrayStart + 1, arrayEnd).trim();
                const insertion = between.length ? `, ${className}` : `${className}`;
                recorder.insertLeft(arrayEnd, insertion);
            } else {
                // inserir providers logo após '{'
                const indentMatch = sourceText.slice(0, objStart).match(/(^|\n)([ \t]*)[^\n]*$/);
                const baseIndent = (indentMatch?.[2] ?? '') + '  ';
                const insertion = `\n${baseIndent}providers: [${className}],`;
                recorder.insertLeft(objStart + 1, insertion);
            }

            treeInner.commitUpdate(recorder);
            return treeInner;
        };

        return chain([generateFile, updateModule])(tree, _context);
    };
}
