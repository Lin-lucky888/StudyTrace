import Image from 'next/image';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  FileText,
  ShieldCheck,
  UploadCloud,
} from 'lucide-react';

import { Link } from '@/core/i18n/navigation';
import { SmartIcon } from '@/shared/blocks/common';
import { Button } from '@/shared/components/ui/button';
import { Highlighter } from '@/shared/components/ui/highlighter';
import { cn } from '@/shared/lib/utils';
import { Section } from '@/shared/types/blocks/landing';

import { SocialAvatars } from './social-avatars';

export function Hero({
  section,
  className,
}: {
  section: Section;
  className?: string;
}) {
  const highlightText = section.highlight_text ?? '';
  let texts = null;
  if (highlightText) {
    texts = section.title?.split(highlightText, 2);
  }

  if (section.use_panel) {
    return (
      <section
        id={section.id}
        className={cn(
          'bg-background pt-24 pb-10 md:pt-32 md:pb-14',
          section.className,
          className
        )}
      >
        <div className="container grid gap-10 lg:grid-cols-[minmax(0,0.95fr)_minmax(420px,1.05fr)] lg:items-center">
          <div className="space-y-7">
            {section.announcement && (
              <Link
                href={section.announcement.url || ''}
                target={section.announcement.target || '_self'}
                className="border-border bg-muted/60 hover:bg-muted inline-flex min-h-9 w-fit items-center gap-2 rounded-md border px-3 text-sm transition-colors"
              >
                <ShieldCheck className="text-primary size-4" />
                <span>{section.announcement.title}</span>
              </Link>
            )}

            <div className="space-y-5">
              {texts && texts.length > 0 ? (
                <h1 className="text-foreground max-w-4xl text-4xl leading-tight font-semibold text-balance md:text-6xl">
                  {texts[0]}
                  <Highlighter action="underline" color="#2563eb">
                    {highlightText}
                  </Highlighter>
                  {texts[1]}
                </h1>
              ) : (
                <h1 className="text-foreground max-w-4xl text-4xl leading-tight font-semibold text-balance md:text-6xl">
                  {section.title}
                </h1>
              )}

              <p
                className="text-muted-foreground max-w-2xl text-base leading-7 md:text-lg"
                dangerouslySetInnerHTML={{ __html: section.description ?? '' }}
              />
            </div>

            {section.buttons && (
              <div className="flex flex-col gap-3 sm:flex-row">
                {section.buttons.map((button, idx) => (
                  <Button
                    asChild
                    size={button.size || 'lg'}
                    variant={button.variant || 'default'}
                    className="min-h-11 px-5 text-sm"
                    key={idx}
                  >
                    <Link
                      href={button.url ?? ''}
                      target={button.target ?? '_self'}
                    >
                      {button.icon && (
                        <SmartIcon name={button.icon as string} />
                      )}
                      <span>{button.title}</span>
                    </Link>
                  </Button>
                ))}
              </div>
            )}

            {section.tip && (
              <p
                className="text-muted-foreground max-w-2xl text-sm leading-6"
                dangerouslySetInnerHTML={{ __html: section.tip ?? '' }}
              />
            )}
          </div>

          <HeroUsePanel panel={section.use_panel} />
        </div>
      </section>
    );
  }

  return (
    <section
      id={section.id}
      className={cn(
        `pt-24 pb-8 md:pt-36 md:pb-8`,
        section.className,
        className
      )}
    >
      {section.announcement && (
        <Link
          href={section.announcement.url || ''}
          target={section.announcement.target || '_self'}
          className="hover:bg-background dark:hover:border-t-border bg-muted group mx-auto mb-8 flex w-fit items-center gap-4 rounded-full border p-1 pl-4 shadow-md shadow-zinc-950/5 transition-colors duration-300 dark:border-t-white/5 dark:shadow-zinc-950"
        >
          <span className="text-foreground text-sm">
            {section.announcement.title}
          </span>
          <span className="dark:border-background block h-4 w-0.5 border-l bg-white dark:bg-zinc-700"></span>

          <div className="bg-background group-hover:bg-muted size-6 overflow-hidden rounded-full duration-500">
            <div className="flex w-12 -translate-x-1/2 duration-500 ease-in-out group-hover:translate-x-0">
              <span className="flex size-6">
                <ArrowRight className="m-auto size-3" />
              </span>
              <span className="flex size-6">
                <ArrowRight className="m-auto size-3" />
              </span>
            </div>
          </div>
        </Link>
      )}

      <div className="relative mx-auto max-w-full px-4 text-center md:max-w-5xl">
        {texts && texts.length > 0 ? (
          <h1 className="text-foreground text-4xl font-semibold text-balance sm:mt-12 sm:text-6xl">
            {texts[0]}
            <Highlighter action="underline" color="#FF9800">
              {highlightText}
            </Highlighter>
            {texts[1]}
          </h1>
        ) : (
          <h1 className="text-foreground text-4xl font-semibold text-balance sm:mt-12 sm:text-6xl">
            {section.title}
          </h1>
        )}

        <p
          className="text-muted-foreground mt-8 mb-8 text-lg text-balance"
          dangerouslySetInnerHTML={{ __html: section.description ?? '' }}
        />

        {section.buttons && (
          <div className="flex items-center justify-center gap-4">
            {section.buttons.map((button, idx) => (
              <Button
                asChild
                size={button.size || 'default'}
                variant={button.variant || 'default'}
                className="px-4 text-sm"
                key={idx}
              >
                <Link href={button.url ?? ''} target={button.target ?? '_self'}>
                  {button.icon && <SmartIcon name={button.icon as string} />}
                  <span>{button.title}</span>
                </Link>
              </Button>
            ))}
          </div>
        )}

        {section.tip && (
          <p
            className="text-muted-foreground mt-6 block text-center text-sm"
            dangerouslySetInnerHTML={{ __html: section.tip ?? '' }}
          />
        )}

        {section.show_avatars && (
          <SocialAvatars tip={section.avatars_tip || ''} />
        )}
      </div>

      {(section.image?.src || section.image_invert?.src) && (
        <div className="border-foreground/10 relative mt-8 border-y sm:mt-16">
          <div className="relative z-10 mx-auto max-w-6xl border-x px-3">
            <div className="border-x">
              <div
                aria-hidden
                className="h-3 w-full bg-[repeating-linear-gradient(-45deg,var(--color-foreground),var(--color-foreground)_1px,transparent_1px,transparent_4px)] opacity-5"
              />
              {section.image_invert?.src && (
                <Image
                  className="border-border/25 relative z-2 hidden w-full border dark:block"
                  src={section.image_invert.src}
                  alt={section.image_invert.alt || section.image?.alt || ''}
                  width={
                    section.image_invert.width || section.image?.width || 1200
                  }
                  height={
                    section.image_invert.height || section.image?.height || 630
                  }
                  sizes="(max-width: 768px) 100vw, 1200px"
                  loading="lazy"
                  fetchPriority="high"
                  quality={75}
                  unoptimized={section.image_invert.src.startsWith('http')}
                />
              )}
              {section.image?.src && (
                <Image
                  className="border-border/25 relative z-2 block w-full border dark:hidden"
                  src={section.image.src}
                  alt={section.image.alt || section.image_invert?.alt || ''}
                  width={
                    section.image.width || section.image_invert?.width || 1200
                  }
                  height={
                    section.image.height || section.image_invert?.height || 630
                  }
                  sizes="(max-width: 768px) 100vw, 1200px"
                  loading="lazy"
                  fetchPriority="high"
                  quality={75}
                  unoptimized={section.image.src.startsWith('http')}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {section.background_image?.src && (
        <div className="absolute inset-0 -z-10 hidden h-full w-full overflow-hidden md:block">
          <div className="from-background/80 via-background/80 to-background absolute inset-0 z-10 bg-gradient-to-b" />
          <Image
            src={section.background_image.src}
            alt={section.background_image.alt || ''}
            className="object-cover opacity-60 blur-[0px]"
            fill
            loading="lazy"
            sizes="(max-width: 768px) 0vw, 100vw"
            quality={70}
            unoptimized={section.background_image.src.startsWith('http')}
          />
        </div>
      )}
    </section>
  );
}

function HeroUsePanel({ panel }: { panel: any }) {
  const steps = panel.steps || [];
  const cards = panel.cards || [];
  const metrics = panel.metrics || [];

  return (
    <div className="bg-card shadow-foreground/5 rounded-lg border p-3 shadow-xl">
      <div className="bg-background rounded-md border">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 font-medium">
              <FileText className="text-primary size-4" />
              {panel.title}
            </div>
            <p className="text-muted-foreground mt-1 text-sm">
              {panel.description}
            </p>
          </div>
          {panel.status && (
            <span className="bg-muted inline-flex h-8 w-fit items-center rounded-md border px-3 text-xs font-medium">
              {panel.status}
            </span>
          )}
        </div>

        <div className="grid gap-4 p-4">
          <Link
            href={panel.action_url || '/studytrace'}
            className="group bg-muted/35 hover:bg-muted/55 flex min-h-32 items-center justify-center rounded-md border border-dashed p-4 text-center transition-colors"
          >
            <div className="space-y-3">
              <div className="bg-background mx-auto flex size-11 items-center justify-center rounded-md border shadow-sm">
                <UploadCloud className="text-primary size-5" />
              </div>
              <div>
                <div className="font-medium">{panel.upload_title}</div>
                <p className="text-muted-foreground mt-1 text-sm leading-6">
                  {panel.upload_description}
                </p>
              </div>
            </div>
          </Link>

          <div className="grid gap-2 sm:grid-cols-5">
            {steps.map((step: any, index: number) => (
              <div
                key={step.title || index}
                className="bg-card rounded-md border px-3 py-3"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="bg-primary/10 text-primary flex size-6 items-center justify-center rounded-md text-xs font-semibold">
                    {index + 1}
                  </span>
                  {index < 2 ? (
                    <CheckCircle2 className="size-4 text-green-600" />
                  ) : index === 3 ? (
                    <AlertTriangle className="size-4 text-amber-600" />
                  ) : (
                    <Clock3 className="text-muted-foreground size-4" />
                  )}
                </div>
                <div className="text-xs leading-5 font-medium">
                  {step.title}
                </div>
              </div>
            ))}
          </div>

          <div className="grid gap-3 md:grid-cols-[1fr_0.9fr]">
            <div className="space-y-2">
              {cards.map((card: any, index: number) => (
                <div
                  key={card.title || index}
                  className="bg-card rounded-md border p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium">{card.title}</div>
                      <p className="text-muted-foreground mt-1 text-xs leading-5">
                        {card.description}
                      </p>
                    </div>
                    <span className="bg-primary/10 text-primary rounded-md px-2 py-1 text-xs">
                      {card.label}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-muted/25 rounded-md border p-3">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                <ShieldCheck className="text-primary size-4" />
                {panel.risk_title}
              </div>
              <div className="space-y-3">
                {metrics.map((metric: any, index: number) => (
                  <div key={metric.label || index}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span>{metric.label}</span>
                      <span className="font-medium">{metric.value}</span>
                    </div>
                    <div className="bg-muted h-2 rounded-full">
                      <div
                        className="bg-primary h-2 rounded-full"
                        style={{ width: `${metric.percent || 50}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <Button asChild className="mt-4 w-full">
                <Link href={panel.action_url || '/studytrace'}>
                  <ArrowRight className="size-4" />
                  {panel.action_title}
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
