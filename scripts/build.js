import esbuild from 'esbuild'
import fs from 'fs'

const result = await esbuild.build({
  entryPoints: ['src/client/svg.js'],
  bundle: true,
  format: 'iife',
  outfile: 'client/svg.js',
  sourcemap: true,
  minify: true,
  metafile: true,
})

fs.writeFileSync('meta-client.json', JSON.stringify(result.metafile))
console.log('built client/svg.js')
