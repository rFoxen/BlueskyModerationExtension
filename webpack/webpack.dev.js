// webpack/webpack.dev.js

const { merge } = require('webpack-merge');
const common = require('./webpack.common.js');

module.exports = merge(common, {
    mode: 'development',
    devtool: 'inline-source-map', // Enables debugging with source maps
    output: {
        clean: true, // Clears previous builds
    },
    module: {
        rules: [
            // CSS rule for development
            {
                test: /\.css$/,
                use: ['style-loader', 'css-loader'], // Use style-loader in development
            },
        ],
    },
    plugins: [
    ],
});
