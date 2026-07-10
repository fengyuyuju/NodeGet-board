<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";

const route = useRoute();

const routeKey = computed(() => {
  // matched[2] is the first dashboard child — what AppMain's <router-view> renders
  const record = route.matched[2];
  if (!record) return route.path;

  const paramNames = [...record.path.matchAll(/:(\w+)/g)].map((m) => m[1]!);
  if (paramNames.length === 0) return record.path;

  const resolved = Object.fromEntries(
    paramNames.map((name) => [
      name,
      (route.params as Record<string, string>)[name],
    ]),
  );
  return `${record.path}:${JSON.stringify(resolved)}`;
});
</script>

<template>
  <main class="flex-1 overflow-auto bg-background p-6">
    <router-view v-slot="{ Component }">
      <Transition name="page" mode="out-in">
        <component :is="Component" v-if="Component" :key="routeKey" />
      </Transition>
    </router-view>
  </main>
</template>

<style scoped>
.page-enter-active,
.page-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.page-enter-from {
  opacity: 0;
  transform: translateY(6px);
}

.page-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
