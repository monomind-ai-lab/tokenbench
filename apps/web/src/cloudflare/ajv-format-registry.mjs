/**
 * Format registry shared between the precompiled contract validators and the
 * Ajv-compatible shim.
 *
 * Ajv's standalone output captures its format definitions when the generated
 * module is evaluated, but the accepted-contract module registers its formats
 * after importing Ajv. The exported `formats` proxy therefore hands out a stable
 * wrapper per format name and resolves the real implementation at call time.
 */
const implementations = new Map();
const wrappers = new Map();

export function registerFormat(name, definition) {
  implementations.set(name, definition);
}

export const formats = new Proxy(
  {},
  {
    get(_target, name) {
      if (typeof name !== "string") return undefined;
      let wrapper = wrappers.get(name);
      if (!wrapper) {
        wrapper = {
          type: "string",
          validate(value) {
            const definition = implementations.get(name);
            if (!definition) throw new TypeError(`Contract format "${name}" was never registered.`);
            return definition.validate(value);
          },
        };
        wrappers.set(name, wrapper);
      }
      return wrapper;
    },
  },
);
