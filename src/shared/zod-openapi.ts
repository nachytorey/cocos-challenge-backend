import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

/**
 * Agrega `.openapi()` a zod. Tiene que ejecutarse ANTES de crear cualquier schema que lo use:
 * en zod 4 los métodos se asignan a cada instancia al crearla, así que un schema creado antes de
 * este módulo no tiene `.openapi`. Por eso todo módulo que crea schemas compartidos lo importa
 * primero (`import './zod-openapi'`), en vez de depender del orden de los demás `import`.
 */
extendZodWithOpenApi(z);

export { z };
