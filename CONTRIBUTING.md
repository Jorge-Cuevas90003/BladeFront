# Contribuir a BladeFront

## Definición de terminado

Un cambio no se considera terminado hasta que código, pruebas y documentación
describan el mismo comportamiento.

Antes de hacer commit:

1. Ejecutar las pruebas relacionadas.
2. Revisar `git diff` y excluir archivos generados como `pnpm-lock.yaml` si no
   forman parte deliberada del cambio.
3. Actualizar la documentación según esta tabla:

| Si cambia… | Actualizar… |
|---|---|
| Arquitectura, roles o flujo de procesos | `docs/documentacion-implementacion.md` y `docs/manual-conexion-red.md` |
| Protocolo, mensajes, puertos o interoperabilidad | verificar primero `erickm13/CC8-Protocolo`; después actualizar los dos documentos anteriores y, si aplica, `red/` |
| Instalación, scripts o comandos | `README.md` |
| Decisión o fase de implementación | cronología de `docs/documentacion-implementacion.md` |
| Uso de IA para una implementación relevante | `PROMPTS.md` |
| Resultado o garantía técnica | prueba automatizada correspondiente |

## Mensajes de commit

Usar mensajes breves que expliquen el resultado:

```text
feat: agregar vista global del servidor
fix: usar exclusivamente UDP 5001 para descubrimiento
docs: registrar arquitectura y cronología de implementación
test: verificar inicio por el primer cliente
```

La documentación relacionada debe viajar en el mismo commit que el código. Si
un cambio no requiere actualizarla, comprobar que los documentos existentes
siguen siendo ciertos.

## Fuente oficial del protocolo

La única especificación normativa es
[erickm13/CC8-Protocolo](https://github.com/erickm13/CC8-Protocolo), rama
`main`. Los documentos locales anteriores son históricos y están en desuso.
`red/v3/protocolo-v3.js` es una implementación del estándar, no su definición.

Todo cambio de red debe:

1. revisar primero la versión viva del repositorio oficial;
2. indicar en el commit o PR la versión, etiqueta o commit oficial consultado;
3. actualizar implementación, pruebas, manual de red y bitácora en el mismo
   cambio;
4. no restaurar una especificación local como fuente de verdad.

## Verificación mínima

```powershell
git status
git diff --check
node test/verify-servidor-estricto-v3.mjs
node test/verify-bridge-v3.mjs
```

No usar `git push --force` sobre `master`.
