"use client";

import { type ReactNode, useId, useMemo, useState } from "react";
import { AnimatePresence, motion, MotionConfig } from "motion/react";

import { cn } from "@/lib/utils";

export type DirectionAwareTab = {
  id: number;
  label: string;
  content: ReactNode;
};

interface DirectionAwareTabsProps {
  tabs: DirectionAwareTab[];
  className?: string;
  rounded?: string;
  roundedInner?: string;
  onChange?: (activeId: number) => void;
}

export function DirectionAwareTabs({
  tabs,
  className,
  rounded,
  roundedInner,
  onChange,
}: DirectionAwareTabsProps) {
  const [activeTab, setActiveTab] = useState(tabs[0]?.id ?? 0);
  const [direction, setDirection] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const instanceId = useId();

  const content = useMemo(
    () => tabs.find((tab) => tab.id === activeTab)?.content ?? null,
    [activeTab, tabs],
  );

  const activate = (newTabId: number) => {
    if (newTabId === activeTab || isAnimating) return;
    setDirection(newTabId > activeTab ? 1 : -1);
    setActiveTab(newTabId);
    onChange?.(newTabId);
  };

  const variants = {
    initial: (nextDirection: number) => ({
      x: 64 * nextDirection,
      opacity: 0,
      filter: "blur(4px)",
    }),
    active: { x: 0, opacity: 1, filter: "blur(0px)" },
    exit: (nextDirection: number) => ({
      x: -64 * nextDirection,
      opacity: 0,
      filter: "blur(4px)",
    }),
  };

  return (
    <div className="flex w-full flex-col items-center">
      <div
        aria-label="Preview section"
        className={cn(
          "flex max-w-full gap-1 overflow-x-auto rounded-full border border-border bg-muted p-[3px] shadow-inner",
          className,
          rounded,
        )}
        role="tablist"
      >
        {tabs.map((tab) => {
          const selected = activeTab === tab.id;
          const tabId = `${instanceId}-tab-${tab.id}`;
          const panelId = `${instanceId}-panel-${tab.id}`;
          return (
            <button
              aria-controls={panelId}
              aria-selected={selected}
              className={cn(
                "relative flex shrink-0 items-center rounded-full px-3.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm",
                selected ? "text-foreground" : "hover:text-foreground",
                rounded ? roundedInner : undefined,
              )}
              id={tabId}
              key={tab.id}
              onClick={() => activate(tab.id)}
              role="tab"
              style={{ WebkitTapHighlightColor: "transparent" }}
              tabIndex={selected ? 0 : -1}
              type="button"
            >
              {selected ? (
                <motion.span
                  className={cn(
                    "absolute inset-0 border border-border bg-background shadow-sm",
                    rounded ? roundedInner : "rounded-full",
                  )}
                  layoutId={`${instanceId}-bubble`}
                  transition={{ type: "spring", bounce: 0.19, duration: 0.4 }}
                />
              ) : null}
              <span className="relative z-10">{tab.label}</span>
            </button>
          );
        })}
      </div>

      <MotionConfig transition={{ duration: 0.4, type: "spring", bounce: 0.2 }}>
        <motion.div
          className="relative mx-auto w-full overflow-x-hidden"
          initial={false}
        >
          <div className="p-1">
            <AnimatePresence
              custom={direction}
              mode="popLayout"
              onExitComplete={() => setIsAnimating(false)}
            >
              <motion.div
                animate="active"
                aria-labelledby={`${instanceId}-tab-${activeTab}`}
                custom={direction}
                exit="exit"
                id={`${instanceId}-panel-${activeTab}`}
                initial="initial"
                key={activeTab}
                onAnimationComplete={() => setIsAnimating(false)}
                onAnimationStart={() => setIsAnimating(true)}
                role="tabpanel"
                variants={variants}
              >
                {content}
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.div>
      </MotionConfig>
    </div>
  );
}
