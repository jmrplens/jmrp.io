import { config, fields, collection, component } from '@keystatic/core';
import * as React from 'react';

export default config({
    storage: {
        kind: 'local',
    },
    collections: {
        posts: collection({
            label: 'Posts',
            slugField: 'title',
            path: 'src/content/posts/*',
            format: { contentField: 'content' },
            schema: {
                title: fields.slug({ name: { label: 'Title' } }),
                publishedDate: fields.date({ label: 'Published Date' }),
                draft: fields.checkbox({ label: 'Draft', defaultValue: false }),
                description: fields.text({ label: 'Description' }),
                tags: fields.array(fields.text({ label: 'Tag' }), {
                    label: 'Tags',
                    itemLabel: (props) => props.value,
                }),
                content: fields.mdx({
                    label: 'Content',
                    options: {
                        image: {
                            directory: 'public/images/posts',
                            publicPath: '/images/posts/',
                        },
                    },
                }),
            },
        }),
    },
});
