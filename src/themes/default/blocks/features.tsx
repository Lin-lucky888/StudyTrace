'use client';

import { SmartIcon } from '@/shared/blocks/common/smart-icon';
import { ScrollAnimation } from '@/shared/components/ui/scroll-animation';
import { cn } from '@/shared/lib/utils';
import { Section } from '@/shared/types/blocks/landing';

export function Features({
  section,
  className,
}: {
  section: Section;
  className?: string;
}) {
  return (
    <section
      id={section.id}
      className={cn('py-16 md:py-24', section.className, className)}
    >
      <div className={`container space-y-8 md:space-y-16`}>
        <ScrollAnimation>
          <div className="mx-auto max-w-4xl text-center text-balance">
            <h2 className="text-foreground mb-4 text-3xl font-semibold tracking-tight md:text-4xl">
              {section.title}
            </h2>
            <p className="text-muted-foreground mb-6 md:mb-12 lg:mb-16">
              {section.description}
            </p>
          </div>
        </ScrollAnimation>

        <ScrollAnimation delay={0.2}>
          <div className="relative mx-auto grid divide-x divide-y overflow-hidden rounded-xl border *:p-8 md:*:p-10 sm:grid-cols-2 lg:grid-cols-3">
            {section.items?.map((item, idx) => (
              <div
                className="hover:bg-muted/40 space-y-4 transition-colors duration-200"
                key={idx}
              >
                <div className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-lg">
                  <SmartIcon name={item.icon as string} size={20} />
                </div>
                <h3 className="text-base font-semibold">{item.title}</h3>
                <p className="text-muted-foreground text-sm leading-6">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </ScrollAnimation>
      </div>
    </section>
  );
}
