/* tslint:disable */
/* eslint-disable */

export class CanvasEngine {
    free(): void;
    [Symbol.dispose](): void;
    height(): number;
    static mode_list(): string;
    constructor(mode_id: string, width: number, height: number);
    render_pixels(): Uint8Array;
    resize(width: number, height: number): void;
    set_color(idx: number): void;
    set_mode(mode_id: string): void;
    set_speed(speed: number): void;
    update(dt: number, t_abs: number): void;
    width(): number;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_canvasengine_free: (a: number, b: number) => void;
    readonly canvasengine_height: (a: number) => number;
    readonly canvasengine_mode_list: () => [number, number];
    readonly canvasengine_new: (a: number, b: number, c: number, d: number) => number;
    readonly canvasengine_render_pixels: (a: number) => [number, number];
    readonly canvasengine_resize: (a: number, b: number, c: number) => void;
    readonly canvasengine_set_color: (a: number, b: number) => void;
    readonly canvasengine_set_mode: (a: number, b: number, c: number) => void;
    readonly canvasengine_set_speed: (a: number, b: number) => void;
    readonly canvasengine_update: (a: number, b: number, c: number) => void;
    readonly canvasengine_width: (a: number) => number;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
