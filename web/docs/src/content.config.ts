import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const docs = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/docs' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    order: z.number().optional(),
    tocItems: z
      .array(
        z.object({
          slug: z.string(),
          text: z.string(),
          depth: z.number().optional(),
        })
      )
      .optional(),
  }),
});

export const collections = { docs };
