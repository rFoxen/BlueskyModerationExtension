// webpack/webpack.prod.js

const { merge } = require('webpack-merge');
const common = require('./webpack.common.js');
const TerserPlugin = require('terser-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

module.exports = merge(common, {
    mode: 'production',
    devtool: false, // No source maps for production
    output: {
        clean: true,
    },
    module: {
        rules: [
            // CSS rule for production
            {
                test: /\.css$/,
                use: [MiniCssExtractPlugin.loader, 'css-loader'], // Use MiniCssExtractPlugin
            },
        ],
    },
    optimization: {
        minimize: true,
        minimizer: [
            new TerserPlugin({
                terserOptions: {
                    compress: {
                        drop_console: true,
                        // Avoid unsafe transformations
                        unsafe: false,
                    },
                    format: {
                        comments: false,
                    },
                    mangle: true,
                    keep_classnames: true,
                    keep_fnames: true,
                },
                extractComments: false,
            }),
        ],
        splitChunks: false, // Disable code splitting
        runtimeChunk: false, // Disable the runtime chunk
    },
    plugins: [
        new MiniCssExtractPlugin({
            filename: '[name].css', // Extracted CSS files will be named after the entry points
        }),
    ],
});
