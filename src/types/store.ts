export interface StoreProduct {
  id: string;
  name: string;
  description: string;
  price: number;
  originalPrice?: number;
  images: string[];
  category: 'android-devices' | 'fire-tv' | 'streaming-boxes' | 'accessories';
  specifications: Record<string, string>;
  inStock: boolean;
  quantity: number;
  features: string[];
  includes: string[];
}

export interface CartItem extends StoreProduct {
  cartQuantity: number;
}

export interface ShoppingCart {
  items: CartItem[];
  total: number;
  shipping: number;
  tax: number;
  grandTotal: number;
}