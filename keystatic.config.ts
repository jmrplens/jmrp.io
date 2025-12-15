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
                        components: {
                            Callout: component({
                                preview: (props) =>
                                    React.createElement('div', {
                                        style: {
                                            borderLeft: '4px solid #ddd',
                                            padding: '1rem',
                                            background: '#f9f9f9',
                                            margin: '1rem 0'
                                        }
                                    }, props.fields.content.element),
                                label: 'Callout',
                                schema: {
                                    type: fields.select({
                                        label: 'Type',
                                        options: [
                                            { label: 'Info', value: 'info' },
                                            { label: 'Warning', value: 'warning' },
                                            { label: 'Error', value: 'error' },
                                            { label: 'Success', value: 'success' },
                                        ],
                                        defaultValue: 'info',
                                    }),
                                    content: fields.child({
                                        kind: 'block',
                                        placeholder: 'Callout content...',
                                    }),
                                },
                            }),
                            YouTube: component({
                                preview: (props) =>
                                    React.createElement('div', {
                                        style: {
                                            background: '#eee',
                                            padding: '2rem',
                                            textAlign: 'center'
                                        }
                                    }, `YouTube Video: ${props.fields.id.value}`),
                                label: 'YouTube Video',
                                schema: {
                                    id: fields.text({ label: 'Video ID' }),
                                    title: fields.text({ label: 'Title', defaultValue: 'YouTube Video' }),
                                },
                            }),
                        },
                    },
                }),
            },
        }),
    },
});
