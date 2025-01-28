// webpack/webpack.dev.js

const { merge } = require('webpack-merge');
const common = require('./webpack.common.js');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const path = require('path'); // Add path if not already present

module.exports = merge(common, {
    mode: 'development',
    devtool: 'inline-source-map', // Enables debugging with source maps
    output: {
        clean: true, // Clears previous builds
    },
    module: {
        rules: [
            // Updated CSS rule for development
            {
                test: /\.css$/,
                use: [MiniCssExtractPlugin.loader, 'css-loader'], // Use MiniCssExtractPlugin in development
            },
        ],
    },
    plugins: [
        new MiniCssExtractPlugin({
            filename: '[name].css', // Extracted CSS files will be named after the entry points
        }),
    ],
});
