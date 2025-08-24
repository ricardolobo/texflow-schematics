"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handlerSchematic = void 0;
const schematics_1 = require("@angular-devkit/schematics");
const core_1 = require("@angular-devkit/core");
const ast_utils_1 = require("@schematics/angular/utility/ast-utils");
const find_module_1 = require("@schematics/angular/utility/find-module");
// TS "vendored" do @schematics/angular para evitar conflitos de tipos
const ts = __importStar(require("@schematics/angular/third_party/github.com/Microsoft/TypeScript/lib/typescript"));
/** 'process-actor.reconciliation.completed' -> 'ProcessActorReconciliationCompletedHandler' */
function toClassName(eventName) {
    const parts = eventName.split(/[.-]/g).filter(Boolean);
    return parts.map((p) => core_1.strings.classify(p)).join('') + 'Handler';
}
/** Converte qualquer formato para kebab-case; preserva hífens existentes */
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
/** Garante path absoluto no FS virtual do Schematics (começa por '/') */
function toAbsPath(p) {
    const clean = p.replace(/\/+$/, '');
    return (0, core_1.normalize)(clean.startsWith('/') ? clean : `/${clean}`);
}
/** Source transform: remove o sufixo ".template" de todos os ficheiros do template. */
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
function handlerSchematic(opts) {
    return (tree, _context) => {
        const eventName = (opts.name || '').trim();
        if (!eventName)
            throw new Error('Parâmetro "name" (evento) é obrigatório.');
        // aceitar moduleName OU path (o Nest CLI pode injetar --path)
        const rawModuleName = (opts.moduleName ?? opts.path ?? '').toString().trim();
        if (!rawModuleName) {
            throw new Error('Indica o nome do módulo (2º argumento) ou --moduleName / --path. Ex.: handler process.reconciliation.completed process-actors');
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
        if (!tree.exists(modulePathAbs))
            throw new Error(`Módulo não encontrado: ${modulePathAbs}`);
        if (tree.exists(targetPathAbs))
            throw new Error(`O handler já existe: ${targetPathAbs}`);
        // 1) gerar ficheiro do handler
        const className = toClassName(eventName);
        const generateFile = (0, schematics_1.mergeWith)((0, schematics_1.apply)((0, schematics_1.url)('./files'), [
            (0, schematics_1.template)({ ...core_1.strings, className, eventName, fileBase }),
            removeTemplateSuffix(), // <-- renomeia *.template -> sem sufixo
            (0, schematics_1.move)(targetDirAbs),
        ]));
        // 2) atualizar o módulo (import + providers)
        const updateModule = (treeInner) => {
            const sourceText = treeInner.read(modulePathAbs).toString('utf-8');
            const sourceFile = ts.createSourceFile(modulePathAbs, sourceText, ts.ScriptTarget.Latest, true);
            // caminho de import relativo SEM .ts
            const relativePath = (0, find_module_1.buildRelativePath)(modulePathAbs, targetPathAbs).replace(/\.ts$/, '');
            // inserir import (no topo)
            const importChange = (0, ast_utils_1.insertImport)(sourceFile, modulePathAbs, className, relativePath);
            // localizar @Module({ ... })
            const moduleDecoIdx = sourceText.indexOf('@Module(');
            if (moduleDecoIdx < 0)
                throw new Error('Decorator @Module não encontrado no ficheiro do módulo.');
            const objStart = sourceText.indexOf('{', moduleDecoIdx);
            if (objStart < 0)
                throw new Error('Objeto de metadata do @Module não encontrado.');
            // encontrar '}' correspondente ao '{' acima
            let brace = 1;
            let i = objStart + 1;
            while (i < sourceText.length && brace > 0) {
                const ch = sourceText[i++];
                if (ch === '{')
                    brace++;
                else if (ch === '}')
                    brace--;
            }
            const objEnd = i - 1;
            if (objEnd <= objStart)
                throw new Error('Falha ao localizar o fecho do objeto do @Module.');
            // preparar update recorder
            const recorder = treeInner.beginUpdate(modulePathAbs);
            // aplicar import
            if (importChange.toAdd)
                recorder.insertLeft(importChange.pos, importChange.toAdd);
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
            }
            else {
                // inserir providers logo após '{'
                const indentMatch = sourceText.slice(0, objStart).match(/(^|\n)([ \t]*)[^\n]*$/);
                const baseIndent = (indentMatch?.[2] ?? '') + '  ';
                const insertion = `\n${baseIndent}providers: [${className}],`;
                recorder.insertLeft(objStart + 1, insertion);
            }
            treeInner.commitUpdate(recorder);
            return treeInner;
        };
        return (0, schematics_1.chain)([generateFile, updateModule])(tree, _context);
    };
}
exports.handlerSchematic = handlerSchematic;
