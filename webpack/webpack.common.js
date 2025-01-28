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
        alias: {
            '@public': path.resolve(__dirname, '../public/'),
            '@src': path.resolve(__dirname, '../src/'),
            '@types': path.resolve(__dirname, '../types/'),
        },
        extensions: ['.ts', '.js', '.hbs', '.css'],
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
                    helperDirs: [
                        path.resolve(__dirname, '../src/helpers')
                    ],
                },
            },

            // CSS and Font Rules...
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
                { from: 'public', to: '.' },
                // Copy everything from public
            ],
        }),
    ],
};
