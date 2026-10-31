export function equal(actual, expected) {
    if (JSON.stringify(actual) !== JSON.stringify(expected))
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
export function ok(value, message = 'Assertion failed') { if (!value) throw new Error(message); }
export function throws(fn) { let caught = false; try { fn(); } catch { caught = true; } ok(caught, 'Expected rejection'); }
export async function test(name, fn) { await fn(); print(`PASS ${name}`); }
