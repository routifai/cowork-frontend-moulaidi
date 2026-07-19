module.exports = {
  hooks: {
    readPackage(pkg) {
      if (pkg.name === 'hypatia-frontend') {
        pkg.pnpm = pkg.pnpm || {};
        pkg.pnpm.onlyBuiltDependencies = ['@biomejs/biome', 'esbuild'];
      }
      return pkg;
    }
  }
};
