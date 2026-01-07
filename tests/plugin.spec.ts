import { describe, expect, it } from 'bun:test';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const TEMP_DIR = path.join(process.cwd(), 'temp-test-plugin');

function runOxlint(targetDir: string) {
    try {
        return execSync(`bun run oxlint -c .oxlintrc.json ${targetDir}`, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e: any) {
        return e.stdout + e.stderr;
    }
}

describe('Oxlint Plugin Integration', () => {

    // Helper to setup test file
    function setup(filename: string, content: string) {
        if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR);
        fs.writeFileSync(path.join(TEMP_DIR, filename), content);
    }

    // Helper to cleanup
    function cleanup() {
        if (fs.existsSync(TEMP_DIR)) fs.rmSync(TEMP_DIR, { recursive: true });
    }

    it('should detect STYLE-001 File Naming violations', () => {
        setup('BadName.ts', 'export const x = 1;');
        const output = runOxlint(TEMP_DIR);
        expect(output).toContain('Filename \'BadName.ts\' is not kebab-case');
        cleanup();
    });

    it('should detect STYLE-002 Single Letter violations', () => {
        setup('test.ts', 'const a = 1;');
        const output = runOxlint(TEMP_DIR);
        expect(output).toContain("Identifier 'a' is too short");
        cleanup();
    });

    it('should detect STYLE-004 Inline Object violations', () => {
        setup('inline.ts', 'function f(a: { x: number }) {}');
        const output = runOxlint(TEMP_DIR);
        expect(output).toContain('Inline object type detected');
        cleanup();
    });

    it('should detect STYLE-005 Type Separation violations', () => {
        setup('logic.ts', 'type MyType = string; interface MyInterface {}');
        const output = runOxlint(TEMP_DIR);
        expect(output).toContain('Type alias \'MyType\' should be in types.ts');
        expect(output).toContain('Interface \'MyInterface\' should be in interfaces.ts');
        cleanup();
    });

    it('should detect STYLE-007 Explicit Return Type violations', () => {
        setup('return-type.ts', 'export function foo() { return 1; }');
        const output = runOxlint(TEMP_DIR);
        expect(output).toContain('missing return type annotation');
        cleanup();
    });

    it('should detect STYLE-011 Local Constant violations', () => {
        setup('local-const.ts', 'function f() { const MAX_VAL = 10; }');
        const output = runOxlint(TEMP_DIR);
        expect(output).toContain("Local constant 'MAX_VAL' detected");
        cleanup();
    });

    it('should detect STYLE-014 Shorthand Property violations', () => {
        setup('shorthand.ts', 'const a = 1; const obj = { a: a };');
        const output = runOxlint(TEMP_DIR);
        expect(output).toContain("Use shorthand property for 'a'");
        cleanup();
    });

    it('should detect STYLE-015 Max Params violations', () => {
        setup('params.ts', 'function f(a,b,c,d,e) {}');
        const output = runOxlint(TEMP_DIR);
        expect(output).toContain('Maximum allowed is 4');
        cleanup();
    });

    it('should detect STYLE-018 No Bracket Notation violations', () => {
        setup('bracket.ts', 'const obj = {}; const val = obj["prop"];');
        const output = runOxlint(TEMP_DIR);
        expect(output).toContain("Use dot notation instead of bracket notation for 'prop'");
        cleanup();
    });

    it('should detect STYLE-019 Nullish Coalescing violations', () => {
        setup('nullish.ts', 'const val = a || b;');
        const output = runOxlint(TEMP_DIR);
        expect(output).toContain("Prefer '??' (nullish coalescing) over '||'");
        cleanup();
    });

    it('should detect STYLE-021 Enum PascalCase violations', () => {
        setup('enums.ts', 'enum Status { active = 1 }');
        const output = runOxlint(TEMP_DIR);
        expect(output).toContain('Enum member \'active\' is not PascalCase');
        cleanup();
    });

     it('should detect STYLE-022 Repeated Literals violations', () => {
        setup('literals.ts', 'const a = "foo"; const b = "foo";');
        const output = runOxlint(TEMP_DIR);
        expect(output).toContain('String literal "foo" appears 2 times');
        cleanup();
    });
});
