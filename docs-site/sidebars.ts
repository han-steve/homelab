import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docs: [
    'index',
    {
      type: 'category',
      label: 'Architecture',
      items: ['architecture/overview', 'architecture/networking', 'architecture/pki'],
    },
    {
      type: 'category',
      label: 'Services',
      items: ['services/media', 'services/monitoring', 'services/home-automation', 'services/storage'],
    },
    {
      type: 'category',
      label: 'Operations',
      items: ['operations/backup', 'operations/dns', 'operations/troubleshooting'],
    },
  ],
};

export default sidebars;
