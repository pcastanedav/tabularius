from denoland/deno:alpine-2.2.12

arg PROJECT
label project=$PROJECT

# `libstdc++` seems required by DuckDB dylibs.
run apk add --no-cache make libstdc++

workdir $DENO_DIR

copy deno.json deps.mjs .
run deno cache --allow-import deps.mjs

workdir /app
copy . .

entrypoint ["deno"]
