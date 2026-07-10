try {
  console.log('NODE_PATH=' + (process.env.NODE_PATH || ''));
  console.log(require.resolve('playwright'));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
