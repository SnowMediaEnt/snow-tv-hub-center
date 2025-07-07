import { StoreProduct } from '@/types/store';

export const storeProducts: StoreProduct[] = [
  // Android Devices
  {
    id: 'android-box-4k-pro',
    name: 'Android TV Box 4K Pro',
    description: 'Premium Android 11 TV Box with 8GB RAM and 64GB storage. Perfect for streaming with zero buffering.',
    price: 129.99,
    originalPrice: 159.99,
    images: ['/api/placeholder/400/300'],
    category: 'android-devices',
    specifications: {
      'Operating System': 'Android 11',
      'RAM': '8GB DDR4',
      'Storage': '64GB eMMC',
      'CPU': 'Quad-core ARM Cortex-A73',
      'GPU': 'Mali-G31 MP2',
      'WiFi': '802.11 ac dual band',
      'Bluetooth': '5.0',
      'Resolution': '4K@60fps, 1080P@60fps'
    },
    inStock: true,
    quantity: 25,
    features: [
      'Pre-loaded with streaming apps',
      'Remote control included',
      'Ethernet port for stable connection',
      'Dual USB ports',
      'HDMI 2.1 output'
    ],
    includes: [
      'Android TV Box',
      'Remote Control',
      'HDMI Cable',
      'Power Cable',
      'User Manual',
      'Setup Instructions'
    ]
  },
  {
    id: 'android-stick-mini',
    name: 'Android Streaming Stick Mini',
    description: 'Compact Android streaming stick. Plug and play solution for any TV with HDMI port.',
    price: 79.99,
    originalPrice: 99.99,
    images: ['/api/placeholder/400/300'],
    category: 'android-devices',
    specifications: {
      'Operating System': 'Android 10',
      'RAM': '4GB',
      'Storage': '32GB',
      'CPU': 'Quad-core ARM Cortex-A55',
      'WiFi': '802.11 b/g/n/ac',
      'Bluetooth': '4.2',
      'Resolution': '4K@30fps, 1080P@60fps'
    },
    inStock: true,
    quantity: 40,
    features: [
      'Ultra-compact design',
      'Voice remote included',
      'Google Play Store access',
      'Chromecast built-in',
      'Low power consumption'
    ],
    includes: [
      'Android Streaming Stick',
      'Voice Remote',
      'USB Power Cable',
      'HDMI Extension Cable',
      'Setup Guide'
    ]
  },

  // Fire TV Devices
  {
    id: 'firestick-4k-max-custom',
    name: 'Fire TV Stick 4K Max (Customized)',
    description: 'Amazon Fire TV Stick 4K Max fully customized with premium streaming apps and optimized settings.',
    price: 89.99,
    originalPrice: 54.99,
    images: ['/api/placeholder/400/300'],
    category: 'fire-tv',
    specifications: {
      'Processor': 'Quad-core 1.8GHz',
      'RAM': '2GB',
      'Storage': '8GB',
      'WiFi': 'Wi-Fi 6 support',
      'Bluetooth': '5.0',
      'Resolution': '4K Ultra HD, HDR, HDR10+, Dolby Vision'
    },
    inStock: true,
    quantity: 60,
    features: [
      'Pre-loaded streaming apps',
      'Alexa Voice Remote included',
      'Optimized for streaming',
      'Fast WiFi 6 support',
      'Gaming capable'
    ],
    includes: [
      'Fire TV Stick 4K Max',
      'Alexa Voice Remote',
      'USB Cable',
      'Power Adapter',
      'HDMI Extender',
      'Setup & App Guide'
    ]
  },
  {
    id: 'fire-tv-cube-custom',
    name: 'Fire TV Cube (Customized)',
    description: 'Most powerful Fire TV device with hands-free Alexa and 4K Ultra HD streaming. Fully customized setup.',
    price: 149.99,
    originalPrice: 139.99,
    images: ['/api/placeholder/400/300'],
    category: 'fire-tv',
    specifications: {
      'Processor': 'Hexa-core with dedicated GPU',
      'RAM': '2GB',
      'Storage': '16GB',
      'WiFi': 'Wi-Fi 6E support',
      'Bluetooth': '5.0',
      'Resolution': '4K Ultra HD, HDR10, HDR10+, Dolby Vision'
    },
    inStock: true,
    quantity: 15,
    features: [
      'Hands-free Alexa',
      'IR blaster built-in',
      'Ethernet port',
      'Premium streaming apps',
      'Voice control for TV and soundbar'
    ],
    includes: [
      'Fire TV Cube',
      'Alexa Voice Remote',
      'IR Extender Cable',
      'Ethernet Adapter',
      'Power Cable',
      'Complete Setup Service'
    ]
  },

  // Premium Streaming Boxes
  {
    id: 'nvidia-shield-tv-pro',
    name: 'NVIDIA Shield TV Pro',
    description: 'Ultimate Android TV streaming device with AI upscaling and GeForce NOW gaming.',
    price: 199.99,
    images: ['/api/placeholder/400/300'],
    category: 'streaming-boxes',
    specifications: {
      'Processor': 'NVIDIA Tegra X1+',
      'RAM': '3GB',
      'Storage': '16GB',
      'AI Upscaling': 'NVIDIA AI',
      'WiFi': '802.11ac MIMO',
      'Bluetooth': '5.0',
      'Resolution': '4K HDR at 60fps'
    },
    inStock: true,
    quantity: 8,
    features: [
      'AI-enhanced 4K upscaling',
      'GeForce NOW gaming',
      'Plex Media Server',
      'Google Assistant built-in',
      'Fastest Android TV performance'
    ],
    includes: [
      'NVIDIA Shield TV Pro',
      'Shield Remote',
      'HDMI Cable',
      'Power Adapter',
      'Premium Setup Guide'
    ]
  },

  // Accessories
  {
    id: 'universal-remote-control',
    name: 'Universal Streaming Remote',
    description: 'Backlit universal remote compatible with all streaming devices. Perfect replacement or upgrade.',
    price: 24.99,
    images: ['/api/placeholder/400/300'],
    category: 'accessories',
    specifications: {
      'Compatibility': 'Fire TV, Android TV, Roku, Apple TV',
      'Battery': '2x AAA (included)',
      'Range': 'Up to 30 feet',
      'Backlight': 'Yes',
      'Programmable': 'Yes'
    },
    inStock: true,
    quantity: 100,
    features: [
      'Backlit keys',
      'Voice search button',
      'Pre-programmed for major devices',
      'Learn function',
      'Ergonomic design'
    ],
    includes: [
      'Universal Remote',
      'AAA Batteries (2)',
      'Setup Instructions',
      'Programming Guide'
    ]
  },
  {
    id: 'ethernet-adapter-kit',
    name: 'Ethernet Adapter Kit',
    description: 'Wired internet connection kit for streaming sticks. Eliminates WiFi issues and buffering.',
    price: 19.99,
    images: ['/api/placeholder/400/300'],
    category: 'accessories',
    specifications: {
      'Compatibility': 'Fire TV Stick, Android Sticks',
      'Speed': '10/100 Mbps',
      'Cable Length': '3 feet',
      'Connector': 'Micro USB',
      'Power': 'USB powered'
    },
    inStock: true,
    quantity: 75,
    features: [
      'Stable wired connection',
      'Reduces buffering',
      'Plug and play',
      'No software needed',
      'Compact design'
    ],
    includes: [
      'Ethernet Adapter',
      'Ethernet Cable (3ft)',
      'Installation Guide'
    ]
  }
];

export const getProductsByCategory = (category: StoreProduct['category']) => {
  return storeProducts.filter(product => product.category === category);
};

export const getProductById = (id: string) => {
  return storeProducts.find(product => product.id === id);
};

export const getFeaturedProducts = () => {
  return storeProducts.filter(product => product.originalPrice && product.originalPrice > product.price);
};

export const getInStockProducts = () => {
  return storeProducts.filter(product => product.inStock && product.quantity > 0);
};