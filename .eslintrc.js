module.exports = {
  root: true,
  extends: '@react-native',
  overrides: [
    {
      // Node.js release tooling (CommonJS, prints to the console by design).
      files: ['scripts/**/*.js'],
      env: { node: true },
    },
  ],
};
