import Image from 'next/image';

import { Link } from '@/core/i18n/navigation';
import { Brand as BrandType } from '@/shared/types/blocks/common';

export function BrandLogo({ brand }: { brand: BrandType }) {
  return (
    <Link
      href={brand.url || ''}
      target={brand.target || '_self'}
      className={`flex min-w-0 items-center gap-2.5 ${brand.className || ''}`}
    >
      {brand.logo && (
        <Image
          src={brand.logo.src}
          alt={brand.title ? '' : brand.logo.alt || ''}
          width={brand.logo.width || 80}
          height={brand.logo.height || 80}
          className="h-8 w-auto rounded-lg"
          unoptimized={brand.logo.src.startsWith('http')}
        />
      )}
      {brand.title && (
        <span className="truncate text-base font-semibold sm:text-lg">
          {brand.title}
        </span>
      )}
    </Link>
  );
}
