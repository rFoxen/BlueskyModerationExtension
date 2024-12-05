// webpack/webpack.common.js

const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
    entry: {
        background: './src/background.ts',
        content: './src/content.ts',
    },
    output: {
        path: path.resolve(__dirname, '../dist'),
        filename: '[name].js',
        chunkFilename: '[name].bundle.js',
    },
    resolve: {
        extensions: ['.ts', '.js', '.hbs'],
        alias: {
            '@src': path.resolve(__dirname, '../src/'),
            '@types': path.resolve(__dirname, '../types/'),
            '@public': path.resolve(__dirname, '../public/'),
        },
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                use: 'ts-loader',
                exclude: /node_modules/,
            },
            {
                test: /\.hbs$/,
                loader: 'handlebars-loader',
                options: {
                    helperDirs: path.join(__dirname, '../src/helpers'),
                },
            },
            // Note: CSS rule is now defined in webpack.dev.js and webpack.prod.js
            {
                test: /\.(woff(2)?|eot|ttf|otf|svg)$/,
                type: 'asset/resource',
                generator: {
                    filename: 'fonts/[name][ext]',
                },
            },
        ],
    },
    plugins: [
        new CopyWebpackPlugin({
            patterns: [
                { from: 'public', to: '.' }, // Copy everything from public
            ],
        }),
    ],
};
