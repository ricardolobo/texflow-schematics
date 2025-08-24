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

export interface Options {
    name: string;        // ex.: process.reconciliation.completed
    moduleName?: string; // ex.: process-actors (fallback: --path)
    directory?: string;  // override opcional
    path?: string;       // injetado pelo Nest CLI por vezes
}

/** 'process-actor.reconciliation.completed' -> 'ProcessActorReconciliationCompletedEvent' */
function toClassName(eventName: string): string {
    const parts = eventName.split(/[.-]/g).filter(Boolean);
    return parts.map((p) => strings.classify(p)).join('') + 'Event';
}

/** kAbc || k-abc -> 'k-abc' */
function toKebab(name: string): string {
    if (!name) return '';
    if (name.includes('-')) return name.toLowerCase();
    return name
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .replace(/[_\s]+/g, '-')
        .toLowerCase();
}

/** Normaliza para path absoluto do FS virtual (prefixo '/') */
function toAbsPath(p: string): string {
    const clean = p.replace(/\/+$/, '');
    return (normalize(clean.startsWith('/') ? clean : `/${clean}`) as unknown) as string;
}

/** Remove o sufixo ".template" dos ficheiros gerados a partir do template */
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

export function eventSchematic(opts: Options): Rule {
    return (tree: Tree, _ctx: SchematicContext) => {
        const eventName = (opts.name || '').trim();
        if (!eventName) throw new Error('Parâmetro "name" (evento) é obrigatório.');

        // aceitar moduleName OU path como fallback
        const rawModuleName = (opts.moduleName ?? opts.path ?? '').toString().trim();
        if (!rawModuleName) {
            throw new Error('Indica o nome do módulo (2º argumento) ou --moduleName / --path.');
        }
        const moduleKebab = toKebab(rawModuleName);

        // inferências relativas
        const directoryRel = (opts.directory?.trim() || `src/${moduleKebab}`).replace(/\/+$/, '');

        // absolutos
        const directoryAbs = toAbsPath(directoryRel);
        const targetDirAbs = toAbsPath(`${directoryAbs}/events`);
        const fileBase = eventName; // mantém '.' e '-'
        const targetPathAbs = toAbsPath(`${targetDirAbs}/${fileBase}.event.ts`);

        if (tree.exists(targetPathAbs)) {
            throw new Error(`O evento já existe: ${targetPathAbs}`);
        }

        const className = toClassName(eventName);

        const generateFile = mergeWith(
            apply(url('./files'), [
                template({ ...strings, className, eventName, fileBase }),
                removeTemplateSuffix(),
                move(targetDirAbs),
            ])
        );

        return chain([generateFile])(tree, _ctx);
    };
}
