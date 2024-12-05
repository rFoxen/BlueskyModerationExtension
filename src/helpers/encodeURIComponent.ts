// =============================== //
// src/helpers/encodeURIComponent.ts

import Handlebars from 'handlebars';

Handlebars.registerHelper('encodeURIComponent', function (context: string) {
    return encodeURIComponent(context);
});