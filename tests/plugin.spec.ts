import { describe, expect, it } from 'bun:test';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const TEMP_DIR = path.join(process.cwd(), 'temp-test-plugin');

function runOxlint(targetDir: string) {
    try {
        // Use local oxlint
        return execSync(`bun run oxlint -c .oxlintrc.json ${targetDir}`, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e: any) {
        // Oxlint exits with 1 on error, which throws in execSync
        return e.stdout + e.stderr;
    }
}

describe('Oxlint Plugin Integration', () => {

    it('should detect STYLE-001 File Naming violations', () => {
        if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR);
        fs.writeFileSync(path.join(TEMP_DIR, 'BadName.ts'), 'export const x = 1;');

        const output = runOxlint(TEMP_DIR);
        expect(output).toContain('Filename \'BadName.ts\' is not kebab-case');

        fs.rmSync(TEMP_DIR, { recursive: true });
    });

    it('should detect STYLE-004 Inline Object violations', () => {
        if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR);
        fs.writeFileSync(path.join(TEMP_DIR, 'inline.ts'), 'function f(a: { x: number }) {}');

        const output = runOxlint(TEMP_DIR);
        expect(output).toContain('Inline object type detected');

        fs.rmSync(TEMP_DIR, { recursive: true });
    });

    it('should detect STYLE-015 Max Params violations', () => {
        if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR);
        fs.writeFileSync(path.join(TEMP_DIR, 'params.ts'), 'function f(a,b,c,d,e) {}');

        const output = runOxlint(TEMP_DIR);
        expect(output).toContain('Maximum allowed is 4');

        fs.rmSync(TEMP_DIR, { recursive: true });
    });

    it('should detect STYLE-005 Type Separation violations', () => {
        if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR);
        fs.writeFileSync(path.join(TEMP_DIR, 'logic.ts'), 'type MyType = string; interface MyInterface {}');

        const output = runOxlint(TEMP_DIR);
        expect(output).toContain('Type alias \'MyType\' should be in types.ts');
        expect(output).toContain('Interface \'MyInterface\' should be in interfaces.ts');

        fs.rmSync(TEMP_DIR, { recursive: true });
    });

    it('should detect STYLE-021 Enum PascalCase violations', () => {
        if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR);
        fs.writeFileSync(path.join(TEMP_DIR, 'enums.ts'), 'enum Status { active = 1 }');

        const output = runOxlint(TEMP_DIR);
        expect(output).toContain('Enum member \'active\' is not PascalCase');

        fs.rmSync(TEMP_DIR, { recursive: true });
    });

     it('should detect STYLE-022 Repeated Literals violations', () => {
        if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR);
        fs.writeFileSync(path.join(TEMP_DIR, 'literals.ts'), 'const a = "foo"; const b = "foo";');

        const output = runOxlint(TEMP_DIR);
        // Note: The plugin reports on Program node (file level) or similar.
        // We just check message.
        expect(output).toContain('String literal "foo" appears 2 times');

        fs.rmSync(TEMP_DIR, { recursive: true });
    });
});
