import {
  Baby,
  Bike,
  BookOpen,
  Briefcase,
  Bus,
  Car,
  Cat,
  Coffee,
  CreditCard,
  Droplets,
  Dumbbell,
  Footprints,
  Fuel,
  Gamepad2,
  Gift,
  GraduationCap,
  Heart,
  House,
  Landmark,
  Music,
  PartyPopper,
  PawPrint,
  Pill,
  Pizza,
  Plane,
  Receipt,
  Scissors,
  Shirt,
  ShoppingBag,
  ShieldCheck,
  ShoppingCart,
  Smartphone,
  Sparkles,
  Stethoscope,
  Tag,
  Tv,
  UtensilsCrossed,
  Wifi,
  Wine,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react';

export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  Pizza,
  UtensilsCrossed,
  ShoppingCart,
  Shirt,
  Footprints,
  ShoppingBag,
  PartyPopper,
  Pill,
  Fuel,
  House,
  Zap,
  Tv,
  GraduationCap,
  Coffee,
  Wine,
  Car,
  Bus,
  Bike,
  Plane,
  Heart,
  Stethoscope,
  Dumbbell,
  Gamepad2,
  Music,
  BookOpen,
  Gift,
  Baby,
  PawPrint,
  Cat,
  Scissors,
  Sparkles,
  Smartphone,
  Wifi,
  Droplets,
  Wrench,
  Briefcase,
  Landmark,
  Receipt,
  CreditCard,
  ShieldCheck,
  Tag,
};

export const ICON_LABELS: Record<string, string> = {
  Pizza: 'Delivery', UtensilsCrossed: 'Restaurante', ShoppingCart: 'Mercado', Shirt: 'Roupa', Footprints: 'Calçado',
  ShoppingBag: 'Compras', PartyPopper: 'Lazer', Pill: 'Farmácia', Fuel: 'Combustível', House: 'Casa', Zap: 'Energia',
  Tv: 'Assinaturas', GraduationCap: 'Educação', Coffee: 'Café', Wine: 'Bebidas', Car: 'Carro', Bus: 'Transporte',
  Bike: 'Bicicleta', Plane: 'Viagem', Heart: 'Saúde', Stethoscope: 'Médico', Dumbbell: 'Academia', Gamepad2: 'Jogos',
  Music: 'Música', BookOpen: 'Livros', Gift: 'Presentes', Baby: 'Bebê', PawPrint: 'Pet', Cat: 'Gato', Scissors: 'Beleza',
  Sparkles: 'Cuidados', Smartphone: 'Celular', Wifi: 'Internet', Droplets: 'Água', Wrench: 'Manutenção',
  Briefcase: 'Trabalho', Landmark: 'Banco', Receipt: 'Contas', CreditCard: 'Cartão', ShieldCheck: 'Seguro', Tag: 'Outros',
};

export const CATEGORY_COLORS = ['#ef4444', '#f97316', '#ca8a04', '#16a34a', '#14b8a6', '#0ea5e9', '#2563eb', '#6366f1', '#8b5cf6', '#ec4899', '#a16207', '#64748b'];

export function CategoryIcon({ icon, color, size = 40 }: { icon: string; color: string; size?: number }) {
  const I = CATEGORY_ICONS[icon] ?? Tag;
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-2xl"
      style={{ width: size, height: size, background: `${color}1f`, color }}
      aria-hidden
    >
      <I size={Math.round(size * 0.5)} strokeWidth={2} />
    </span>
  );
}
