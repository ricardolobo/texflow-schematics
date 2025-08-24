"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.eventSchematic = void 0;
const schematics_1 = require("@angular-devkit/schematics");
const core_1 = require("@angular-devkit/core");
/** 'process-actor.reconciliation.completed' -> 'ProcessActorReconciliationCompletedEvent' */
function toClassName(eventName) {
    const parts = eventName.split(/[.-]/g).filter(Boolean);
    return parts.map((p) => core_1.strings.classify(p)).join('') + 'Event';
}
/** kAbc || k-abc -> 'k-abc' */
function toKebab(name) {
    if (!name)
        return '';
    if (name.includes('-'))
        return name.toLowerCase();
    return name
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .replace(/[_\s]+/g, '-')
        .toLowerCase();
}
/** Normaliza para path absoluto do FS virtual (prefixo '/') */
function toAbsPath(p) {
    const clean = p.replace(/\/+$/, '');
    return (0, core_1.normalize)(clean.startsWith('/') ? clean : `/${clean}`);
}
/** Remove o sufixo ".template" dos ficheiros gerados a partir do template */
function removeTemplateSuffix() {
    return (0, schematics_1.forEach)((entry) => {
        if (entry.path.endsWith('.template')) {
            return {
                content: entry.content,
                path: entry.path.slice(0, -'.template'.length),
            };
        }
        return entry;
    });
}
function eventSchematic(opts) {
    return (tree, _ctx) => {
        const eventName = (opts.name || '').trim();
        if (!eventName)
            throw new Error('Parâmetro "name" (evento) é obrigatório.');
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
        const generateFile = (0, schematics_1.mergeWith)((0, schematics_1.apply)((0, schematics_1.url)('./files'), [
            (0, schematics_1.template)({ ...core_1.strings, className, eventName, fileBase }),
            removeTemplateSuffix(),
            (0, schematics_1.move)(targetDirAbs),
        ]));
        return (0, schematics_1.chain)([generateFile])(tree, _ctx);
    };
}
exports.eventSchematic = eventSchematic;
