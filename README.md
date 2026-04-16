# @diagrams-js/plugin-kubernetes

Kubernetes import/export plugin for diagrams-js. Convert between Kubernetes YAML manifests and architecture diagrams.

## Installation

```bash
npm install @diagrams-js/plugin-kubernetes
```

## Usage

### Import from Kubernetes YAML

```typescript
import { Diagram } from "diagrams-js";
import { kubernetesPlugin } from "@diagrams-js/plugin-kubernetes";

const diagram = Diagram("My K8s Application");

// Register the plugin
await diagram.registerPlugins([kubernetesPlugin]);

// Import from Kubernetes YAML
const k8sYaml = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-deployment
spec:
  replicas: 3
  selector:
    matchLabels:
      app: web
  template:
    spec:
      containers:
      - name: web
        image: nginx:latest
        ports:
        - containerPort: 80
---
apiVersion: v1
kind: Service
metadata:
  name: web-service
spec:
  selector:
    app: web
  ports:
  - port: 80
    targetPort: 80
`;

await diagram.import(k8sYaml, "kubernetes");

// Render the diagram
const svg = await diagram.render();
```

### Export to Kubernetes YAML

```typescript
import { Diagram, Node } from "diagrams-js";
import { kubernetesPlugin } from "@diagrams-js/plugin-kubernetes";

const diagram = Diagram("My K8s Application");

// Create nodes with Kubernetes metadata
const deployment = diagram.add(Node("web-deployment"));
deployment.metadata = {
  kubernetes: {
    kind: "Deployment",
    namespace: "default",
    spec: {
      replicas: 3,
      selector: { matchLabels: { app: "web" } },
      template: {
        spec: {
          containers: [
            {
              name: "web",
              image: "nginx:latest",
              ports: [{ containerPort: 80 }],
            },
          ],
        },
      },
    },
  },
};

const service = diagram.add(Node("web-service"));
service.metadata = {
  kubernetes: {
    kind: "Service",
    namespace: "default",
    spec: {
      selector: { app: "web" },
      ports: [{ port: 80 }],
    },
  },
};

// Create relationship
service.to(deployment);

// Register plugin and export
await diagram.registerPlugins([kubernetesPlugin]);
const k8sYaml = await diagram.export("kubernetes");

console.log(k8sYaml);
```

## Features

### Import

- Parse Kubernetes YAML manifests (single or multi-document)
- Create nodes for each resource with appropriate Kubernetes icons
- Support for Deployments, Services, ConfigMaps, Secrets, and more
- Create edges for service-to-deployment relationships
- Create clusters for namespaces
- Store Kubernetes-specific metadata on nodes

### Supported Resource Types

- **Workloads**: Deployment, StatefulSet, DaemonSet, ReplicaSet, Pod, Job, CronJob
- **Services**: Service, Ingress
- **Storage**: ConfigMap, Secret, PersistentVolume, PersistentVolumeClaim, StorageClass
- **RBAC**: Role, RoleBinding, ClusterRole, ClusterRoleBinding, ServiceAccount
- **Cluster**: Namespace, Node, HorizontalPodAutoscaler, NetworkPolicy

### Export

- Export diagrams to Kubernetes YAML format
- Generate valid Kubernetes manifests
- Preserve resource configuration (replicas, selectors, ports, etc.)
- Support for multi-document YAML output

## Configuration

### Custom Resource Mappings

You can customize which icons are used for specific Kubernetes resources. The plugin supports multiple mapping formats:

**Mapping Priority:**

1. **Resource name** (e.g., `my-custom-app`) - takes precedence
2. **Resource kind** (e.g., `Deployment`, `Service`) - fallback

```typescript
import { Diagram } from "diagrams-js";
import { createKubernetesPlugin } from "@diagrams-js/plugin-kubernetes";

const diagram = Diagram("My K8s Application");

// Create plugin with custom resource mappings
const plugin = createKubernetesPlugin({
  defaultNamespace: "production",
  resourceMappings: {
    // 1. Provider icon mapping - use built-in provider icons
    "my-custom-deployment": {
      provider: "onprem",
      type: "compute",
      resource: "Server",
    },

    // 2. Direct URL string - use a custom image URL
    "my-custom-service": "https://example.com/service-icon.png",

    // 3. URL object - same as string but as object
    "my-storage": {
      url: "https://example.com/storage-icon.svg",
    },

    // 4. Iconify icon - use icons from Iconify (https://iconify.design/)
    // Format: { iconify: "prefix:name" }
    "custom-app": {
      iconify: "logos:kubernetes",
    },
    "redis-cache": {
      iconify: "logos:redis",
    },
  },
});

await diagram.registerPlugins([plugin]);
```

### `ResourceMappings` Type

Exported TypeScript type for defining resource mappings with full type safety:

```typescript
import { createKubernetesPlugin, ResourceMappings } from "@diagrams-js/plugin-kubernetes";

const mappings: ResourceMappings = {
  "my-deployment": { provider: "k8s", type: "compute", resource: "Deploy" },
  "my-app": { iconify: "logos:kubernetes" },
  "custom-resource": "https://example.com/icon.svg",
};

const plugin = createKubernetesPlugin({ resourceMappings: mappings });
```

## Iconify Icons

The plugin supports [Iconify](https://iconify.design/) icons, which provides access to 200,000+ open source icons. Use the `{ iconify: "prefix:name" }` format:

- Browse icons at https://icon-sets.iconify.design/
- Common prefixes: `logos:` (technology logos), `mdi:` (Material Design)
- Examples:
  - `{ iconify: "logos:kubernetes" }` - Kubernetes logo
  - `{ iconify: "logos:redis" }` - Redis logo
  - `{ iconify: "mdi:server" }` - Server icon

## Working with Clusters

The Kubernetes plugin automatically creates clusters for namespaces when importing multi-namespace manifests:

```typescript
const multiNsYaml = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app
  namespace: production
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app
  namespace: staging
`;

await diagram.import(multiNsYaml, "kubernetes");
// Creates two clusters: "production" and "staging"
```

## Examples

### Visualize a Microservices Architecture

```typescript
import { Diagram } from "diagrams-js";
import { kubernetesPlugin } from "@diagrams-js/plugin-kubernetes";

const k8sYaml = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: frontend
  namespace: production
spec:
  replicas: 3
  selector:
    matchLabels:
      app: frontend
  template:
    spec:
      containers:
      - name: frontend
        image: nginx:alpine
        ports:
        - containerPort: 80
---
apiVersion: v1
kind: Service
metadata:
  name: frontend-service
  namespace: production
spec:
  selector:
    app: frontend
  ports:
  - port: 80
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
  namespace: production
spec:
  replicas: 2
  selector:
    matchLabels:
      app: api
  template:
    spec:
      containers:
      - name: api
        image: node:18
        ports:
        - containerPort: 3000
---
apiVersion: v1
kind: Service
metadata:
  name: api-service
  namespace: production
spec:
  selector:
    app: api
  ports:
  - port: 3000
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres
  namespace: production
spec:
  serviceName: postgres
  replicas: 1
  selector:
    matchLabels:
      app: postgres
  template:
    spec:
      containers:
      - name: postgres
        image: postgres:15
---
apiVersion: v1
kind: Service
metadata:
  name: postgres-service
  namespace: production
spec:
  selector:
    app: postgres
  ports:
  - port: 5432
`;

const diagram = Diagram("Production Architecture");
await diagram.registerPlugins([kubernetesPlugin]);
await diagram.import(k8sYaml, "kubernetes");

const svg = await diagram.render();
```

### Import Multiple Manifest Files

Compare staging and production configurations:

```typescript
const stagingManifest = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  namespace: staging
spec:
  replicas: 1
  template:
    spec:
      containers:
      - name: web
        image: myapp:staging
`;

const productionManifest = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  namespace: production
spec:
  replicas: 5
  template:
    spec:
      containers:
      - name: web
        image: myapp:latest
`;

const diagram = Diagram("Environment Comparison");
await diagram.registerPlugins([kubernetesPlugin]);

// Each manifest gets its own cluster
await diagram.import([stagingManifest, productionManifest], "kubernetes");
```

### Export with Custom Metadata

```typescript
import { Diagram, Node } from "diagrams-js";
import { kubernetesPlugin } from "@diagrams-js/plugin-kubernetes";

const diagram = Diagram("Production Stack");

const deployment = diagram.add(Node("api"));
deployment.metadata = {
  kubernetes: {
    kind: "Deployment",
    namespace: "production",
    labels: {
      app: "api",
      tier: "backend",
      env: "production",
    },
    spec: {
      replicas: 5,
      selector: {
        matchLabels: { app: "api" },
      },
      template: {
        spec: {
          containers: [
            {
              name: "api",
              image: "myapp:latest",
              resources: {
                limits: {
                  cpu: "1000m",
                  memory: "512Mi",
                },
                requests: {
                  cpu: "200m",
                  memory: "256Mi",
                },
              },
            },
          ],
        },
      },
    },
  },
};

await diagram.registerPlugins([kubernetesPlugin]);
const k8sYaml = await diagram.export("kubernetes");
```

### Round-trip Conversion

Import a manifest, modify it, then export back:

```typescript
const diagram = Diagram("Modified Stack");
await diagram.registerPlugins([kubernetesPlugin]);

// Import existing manifest
await diagram.import(existingK8sYaml, "kubernetes");

// Add a new resource
const monitoring = diagram.add(Node("prometheus"));
monitoring.metadata = {
  kubernetes: {
    kind: "Deployment",
    namespace: "monitoring",
    spec: {
      replicas: 1,
      selector: { matchLabels: { app: "prometheus" } },
      template: {
        spec: {
          containers: [
            {
              name: "prometheus",
              image: "prom/prometheus:latest",
              ports: [{ containerPort: 9090 }],
            },
          ],
        },
      },
    },
  },
};

// Export modified configuration
const updatedYaml = await diagram.export("kubernetes");
```

## Best Practices

### 1. Use Descriptive Resource Names

Resource names become node labels, so use clear, descriptive names:

```yaml
# ✅ Good
apiVersion: apps/v1
kind: Deployment
metadata:
  name: user-service
spec:
  ...

# ❌ Avoid
apiVersion: apps/v1
kind: Deployment
metadata:
  name: svc1
spec:
  ...
```

### 2. Store Metadata for Round-trip

When creating nodes programmatically, store Kubernetes metadata:

```typescript
const node = diagram.add(Node("my-deployment"));
node.metadata = {
  kubernetes: {
    kind: "Deployment",
    namespace: "default",
    spec: {
      replicas: 3,
      selector: { matchLabels: { app: "my-app" } },
      template: {
        spec: {
          containers: [
            {
              name: "app",
              image: "nginx:latest",
            },
          ],
        },
      },
    },
  },
};
```

### 3. Handle Service Selectors

The plugin automatically creates edges when Service selectors match Deployment labels:

```yaml
# Deployment labels
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  labels:
    app: web
    tier: frontend

# Service selector matches
apiVersion: v1
kind: Service
metadata:
  name: web-service
spec:
  selector:
    app: web  # Matches deployment label
  ports:
  - port: 80
```

### 4. Use Namespaces

Organize resources with namespaces for better visualization:

```yaml
# Production resources
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
  namespace: production

# Staging resources
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
  namespace: staging
```

### 5. Multi-document YAML

Use `---` separator for multiple resources in a single file:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
---
apiVersion: v1
kind: Service
metadata:
  name: web-service
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: web-config
```

## Troubleshooting

### Plugin Not Found

Make sure to register the plugin before using import/export:

```typescript
// ✅ Correct order
await diagram.registerPlugins([kubernetesPlugin]);
await diagram.import(k8sYaml, "kubernetes");

// ❌ Wrong order
await diagram.import(k8sYaml, "kubernetes"); // Will fail!
await diagram.registerPlugins([kubernetesPlugin]);
```

### Type Errors with Metadata

The metadata property is typed as `Record<string, any>`, so you can access it directly:

```typescript
node.metadata = {
  kubernetes: { ... }
};
```

### Missing Icons

The plugin maps common Kubernetes resources to provider icons automatically. For custom resources or when you want specific icons:

```typescript
const plugin = createKubernetesPlugin({
  resourceMappings: {
    // Option 1: Use a provider icon
    "my-deployment": { provider: "k8s", type: "compute", resource: "Deploy" },

    // Option 2: Use a custom image URL
    "my-app": "https://example.com/icon.svg",

    // Option 3: Use Iconify (200,000+ icons!)
    "custom-resource": { iconify: "logos:kubernetes" },
  },
});
```

### Import Fails

Ensure your Kubernetes YAML is valid and contains the required fields:

```typescript
// Validate before importing
try {
  await diagram.import(k8sYaml, "kubernetes");
} catch (error) {
  console.error("Import failed:", error.message);
}
```

Required fields for a valid Kubernetes resource:

- `apiVersion`
- `kind`
- `metadata.name`

## Runtime Support

The Kubernetes plugin supports all diagrams-js runtimes:

- **Browser** ✅
- **Node.js** ✅
- **Deno** ✅
- **Bun** ✅

## API Reference

### `kubernetesPlugin`

Pre-created Kubernetes plugin instance (no configuration needed).

```typescript
import { kubernetesPlugin } from "@diagrams-js/plugin-kubernetes";

// ✅ Use the pre-created instance
await diagram.registerPlugins([kubernetesPlugin]);
```

The plugin provides:

- **Importer**: `name: "kubernetes"`, supports `.yml` and `.yaml` files
- **Exporter**: `name: "kubernetes"`, exports to `.yaml` format

### `createKubernetesPlugin(config?)`

Factory function for creating a Kubernetes plugin with custom configuration.

```typescript
import { createKubernetesPlugin } from "@diagrams-js/plugin-kubernetes";

// ✅ Create plugin with custom configuration
const customPlugin = createKubernetesPlugin({
  defaultNamespace: "production",
  resourceMappings: {
    "custom-app": { iconify: "logos:kubernetes" },
  },
});

await diagram.registerPlugins([customPlugin]);
```

**Parameters:**

- `config` (optional): `KubernetesPluginConfig`
  - `defaultNamespace`: Default namespace for exports (default: "default")
  - `resourceMappings`: Custom resource to icon mappings (see [Configuration](#configuration) section)

**Returns:** `DiagramsPlugin` - The plugin instance

**Complete Example with All Mapping Types:**

```typescript
const plugin = createKubernetesPlugin({
  defaultNamespace: "production",
  resourceMappings: {
    // Provider icons - use built-in diagrams-js icons
    "my-deployment": { provider: "k8s", type: "compute", resource: "Deploy" },
    "my-db": { provider: "k8s", type: "storage", resource: "Sts" },

    // Custom URL - use any image URL
    frontend: "https://example.com/react.png",
    backend: { url: "https://example.com/node.svg" },

    // Iconify icons - 200,000+ icons available
    kubernetes: { iconify: "logos:kubernetes" },
    redis: { iconify: "logos:redis" },
    docker: { iconify: "logos:docker" },
  },
});

await diagram.registerPlugins([plugin]);
```

### Plugin Capabilities

The plugin provides two capabilities:

#### Importer

- **Name:** `kubernetes`
- **Extensions:** `.yml`, `.yaml`
- **MIME Types:** `text/yaml`, `application/x-yaml`

#### Exporter

- **Name:** `kubernetes`
- **Extension:** `.yaml`
- **MIME Type:** `text/yaml`

## Further Reading

- diagrams-js Plugin System: See plugin system documentation
- diagrams-js Documentation: https://diagrams-js.hatemhosny.dev
- Kubernetes Documentation: https://kubernetes.io/docs/
- Iconify Icons: https://iconify.design/

## License

MIT
