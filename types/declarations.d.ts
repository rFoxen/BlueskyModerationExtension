declare module '*.hbs' {
    const template: (data?: any) => string;
    export default template;
}

declare module '*.css' {
    const content: { [className: string]: string };
    export default content;
}
