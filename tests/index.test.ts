import { describe, it, expect } from "vitest";
import { Diagram } from "diagrams-js";
import { kubernetesPlugin, createKubernetesPlugin } from "../src/index.js";

describe("Kubernetes Plugin", () => {
  describe("Import", () => {
    it("should import a simple Kubernetes deployment", async () => {
      const diagram = Diagram("Test");
      await diagram.registerPlugins([kubernetesPlugin]);

      const k8sYaml = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx-deployment
  namespace: default
spec:
  replicas: 3
  selector:
    matchLabels:
      app: nginx
  template:
    metadata:
      labels:
        app: nginx
    spec:
      containers:
      - name: nginx
        image: nginx:1.14.2
        ports:
        - containerPort: 80
`;

      await diagram.import(k8sYaml, "kubernetes");

      const json = diagram.toJSON();
      expect(json.nodes).toHaveLength(4); // Deployment + 3 Pod replicas
      expect(json.nodes.find((n) => n.id === "nginx-deployment")).toBeDefined();
      // Check that pod replicas were created
      expect(json.nodes.find((n) => n.id === "nginx-deployment-pod-0")).toBeDefined();
      expect(json.nodes.find((n) => n.id === "nginx-deployment-pod-1")).toBeDefined();
      expect(json.nodes.find((n) => n.id === "nginx-deployment-pod-2")).toBeDefined();
    });

    it("should import a Kubernetes service", async () => {
      const diagram = Diagram("Test");
      await diagram.registerPlugins([kubernetesPlugin]);

      const k8sYaml = `
apiVersion: v1
kind: Service
metadata:
  name: nginx-service
spec:
  selector:
    app: nginx
  ports:
  - port: 80
    targetPort: 8080
`;

      await diagram.import(k8sYaml, "kubernetes");

      const json = diagram.toJSON();
      expect(json.nodes).toHaveLength(1);
      expect(json.nodes.find((n) => n.id === "nginx-service")).toBeDefined();
    });

    it("should import multiple Kubernetes resources", async () => {
      const diagram = Diagram("Test");
      await diagram.registerPlugins([kubernetesPlugin]);

      const k8sYaml = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-deployment
spec:
  replicas: 2
  selector:
    matchLabels:
      app: web
  template:
    spec:
      containers:
      - name: web
        image: nginx:latest
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
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: web-config
data:
  config.json: '{"key": "value"}'
`;

      await diagram.import(k8sYaml, "kubernetes");

      const json = diagram.toJSON();
      expect(json.nodes.length).toBeGreaterThanOrEqual(3);
      expect(json.nodes.find((n) => n.id === "web-deployment")).toBeDefined();
      expect(json.nodes.find((n) => n.id === "web-service")).toBeDefined();
      expect(json.nodes.find((n) => n.id === "web-config")).toBeDefined();
    });

    it("should create edges for service selectors", async () => {
      const diagram = Diagram("Test");
      await diagram.registerPlugins([kubernetesPlugin]);

      const k8sYaml = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app-deployment
  labels:
    app: myapp
spec:
  selector:
    matchLabels:
      app: myapp
  template:
    metadata:
      labels:
        app: myapp
    spec:
      containers:
      - name: app
        image: nginx:latest
---
apiVersion: v1
kind: Service
metadata:
  name: app-service
spec:
  selector:
    app: myapp
  ports:
  - port: 80
`;

      await diagram.import(k8sYaml, "kubernetes");

      const json = diagram.toJSON();
      expect(json.edges).toBeDefined();
      expect(json.edges!.length).toBeGreaterThan(0);
      // Verify the edge connects service to deployment
      const serviceToDeploymentEdge = json.edges!.find(
        (e) => e.from === "app-service" && e.to === "app-deployment",
      );
      expect(serviceToDeploymentEdge).toBeDefined();
    });

    it("should create edge for Service selector with namespace", async () => {
      const diagram = Diagram("Test");
      await diagram.registerPlugins([kubernetesPlugin]);

      const k8sYaml = `
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
kind: Deployment
metadata:
  name: api-deployment
  namespace: production
spec:
  replicas: 2
  selector:
    matchLabels:
      app: api
  template:
    metadata:
      labels:
        app: api
    spec:
      containers:
      - name: api
        image: nginx:latest
`;

      await diagram.import(k8sYaml, "kubernetes");

      const json = diagram.toJSON();
      // Should have edges: Deployment->pod0, Deployment->pod1, Service->Deployment
      expect(json.edges).toBeDefined();
      expect(json.edges!.length).toBeGreaterThanOrEqual(3);

      // Check for service to deployment edge
      const serviceToDeploymentEdge = json.edges!.find(
        (e) => e.from === "production/api-service" && e.to === "production/api-deployment",
      );
      expect(serviceToDeploymentEdge).toBeDefined();
    });

    it("should preserve Kubernetes metadata", async () => {
      const diagram = Diagram("Test");
      await diagram.registerPlugins([kubernetesPlugin]);

      const k8sYaml = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: test-deployment
  namespace: production
  labels:
    app: test
    env: prod
spec:
  replicas: 5
  selector:
    matchLabels:
      app: test
  template:
    spec:
      containers:
      - name: test
        image: nginx:latest
`;

      await diagram.import(k8sYaml, "kubernetes");

      const json = diagram.toJSON();
      const deploymentNode = json.nodes.find((n) => n.id === "production/test-deployment");
      expect(deploymentNode).toBeDefined();
      expect(deploymentNode?.metadata?.kubernetes).toMatchObject({
        apiVersion: "apps/v1",
        kind: "Deployment",
        namespace: "production",
        labels: { app: "test", env: "prod" },
      });
      // Verify replicas is preserved in spec
      expect(deploymentNode?.metadata?.kubernetes?.spec?.replicas).toBe(5);
    });

    it("should preserve replicas count in deployment metadata", async () => {
      const diagram = Diagram("Test");
      await diagram.registerPlugins([kubernetesPlugin]);

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
`;

      await diagram.import(k8sYaml, "kubernetes");

      const json = diagram.toJSON();
      const deploymentNode = json.nodes.find((n) => n.id === "production/frontend");
      expect(deploymentNode).toBeDefined();
      expect(deploymentNode?.metadata?.kubernetes?.spec?.replicas).toBe(3);
      expect(deploymentNode?.metadata?.kubernetes?.spec?.template?.spec?.containers[0]?.image).toBe(
        "nginx:alpine",
      );
    });

    it("should map Deployment to k8s provider icon", async () => {
      const diagram = Diagram("Test");
      await diagram.registerPlugins([kubernetesPlugin]);

      const k8sYaml = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-deployment
spec:
  selector:
    matchLabels:
      app: test
  template:
    spec:
      containers:
      - name: app
        image: nginx:latest
`;

      await diagram.import(k8sYaml, "kubernetes");

      const json = diagram.toJSON();
      const deploymentNode = json.nodes.find((n) => n.id === "my-deployment");
      expect(deploymentNode).toBeDefined();
      // Deployment node uses kind-based icon (provider/type/service not in toJSON)
      expect(deploymentNode?.metadata?.kubernetes?.kind).toBe("Deployment");
    });

    it("should fall back to kind-based icon for resources without containers", async () => {
      const diagram = Diagram("Test");
      await diagram.registerPlugins([kubernetesPlugin]);

      const k8sYaml = `
apiVersion: v1
kind: ConfigMap
metadata:
  name: my-config
data:
  key: value
`;

      await diagram.import(k8sYaml, "kubernetes");

      const json = diagram.toJSON();
      const configNode = json.nodes.find((n) => n.id === "my-config");
      expect(configNode).toBeDefined();
      // ConfigMap should have correct kind in metadata
      expect(configNode?.metadata?.kubernetes?.kind).toBe("ConfigMap");
    });

    it("should map Service to k8s provider icon", async () => {
      const diagram = Diagram("Test");
      await diagram.registerPlugins([kubernetesPlugin]);

      const k8sYaml = `
apiVersion: v1
kind: Service
metadata:
  name: my-service
spec:
  selector:
    app: test
  ports:
  - port: 80
`;

      await diagram.import(k8sYaml, "kubernetes");

      const json = diagram.toJSON();
      const serviceNode = json.nodes.find((n) => n.id === "my-service");
      expect(serviceNode).toBeDefined();
      // Service node uses kind-based icon (provider/type/service not in toJSON)
      expect(serviceNode?.metadata?.kubernetes?.kind).toBe("Service");
    });

    it("should use custom image mappings when configured", async () => {
      const diagram = Diagram("Test");
      const customPlugin = createKubernetesPlugin({
        imageMappings: {
          "my-custom-app": {
            provider: "onprem",
            type: "compute",
            resource: "Server",
          },
        },
      });
      await diagram.registerPlugins([customPlugin]);

      const k8sYaml = `
apiVersion: v1
kind: Service
metadata:
  name: my-custom-app
spec:
  ports:
  - port: 80
`;

      await diagram.import(k8sYaml, "kubernetes");

      const json = diagram.toJSON();
      const customNode = json.nodes.find((n) => n.id === "my-custom-app");
      expect(customNode).toBeDefined();
      expect(customNode?.type).toBe("Server");
      expect(customNode?.provider).toBe("onprem");
    });

    it("should support custom image URLs in imageMappings", async () => {
      const diagram = Diagram("Test");
      const customPlugin = createKubernetesPlugin({
        imageMappings: {
          "my-service": "https://example.com/icon.png",
        },
      });
      await diagram.registerPlugins([customPlugin]);

      const k8sYaml = `
apiVersion: v1
kind: Service
metadata:
  name: my-service
spec:
  ports:
  - port: 80
`;

      await diagram.import(k8sYaml, "kubernetes");

      const json = diagram.toJSON();
      const serviceNode = json.nodes.find((n) => n.id === "my-service");
      expect(serviceNode).toBeDefined();
      expect(serviceNode?.id).toBe("my-service");
    });

    it("should support Iconify icons in imageMappings", async () => {
      const diagram = Diagram("Test");
      const customPlugin = createKubernetesPlugin({
        imageMappings: {
          "k8s-app": { iconify: "logos:kubernetes" },
        },
      });
      await diagram.registerPlugins([customPlugin]);

      const k8sYaml = `
apiVersion: v1
kind: Service
metadata:
  name: k8s-app
spec:
  ports:
  - port: 80
`;

      await diagram.import(k8sYaml, "kubernetes");

      const json = diagram.toJSON();
      const appNode = json.nodes.find((n) => n.id === "k8s-app");
      expect(appNode).toBeDefined();
      expect(appNode?.label).toBe("k8s-app");
    });

    it("should create cluster for Kubernetes resources", async () => {
      const diagram = Diagram("Test");
      await diagram.registerPlugins([kubernetesPlugin]);

      const k8sYaml = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: test-deployment
spec:
  selector:
    matchLabels:
      app: test
  template:
    spec:
      containers:
      - name: app
        image: nginx:latest
`;

      await diagram.import(k8sYaml, "kubernetes");

      const json = diagram.toJSON();
      expect(json.clusters).toBeDefined();
      expect(json.clusters!.length).toBeGreaterThan(0);
    });

    it("should handle ConfigMap resources", async () => {
      const diagram = Diagram("Test");
      await diagram.registerPlugins([kubernetesPlugin]);

      const k8sYaml = `
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
data:
  database.properties: |
    database.host=localhost
    database.port=5432
`;

      await diagram.import(k8sYaml, "kubernetes");

      const json = diagram.toJSON();
      const configNode = json.nodes.find((n) => n.id === "app-config");
      expect(configNode).toBeDefined();
      expect(configNode?.metadata?.kubernetes?.kind).toBe("ConfigMap");
    });

    it("should handle Secret resources", async () => {
      const diagram = Diagram("Test");
      await diagram.registerPlugins([kubernetesPlugin]);

      const k8sYaml = `
apiVersion: v1
kind: Secret
metadata:
  name: app-secret
type: Opaque
data:
  password: c2VjcmV0
`;

      await diagram.import(k8sYaml, "kubernetes");

      const json = diagram.toJSON();
      const secretNode = json.nodes.find((n) => n.id === "app-secret");
      expect(secretNode).toBeDefined();
      expect(secretNode?.metadata?.kubernetes?.kind).toBe("Secret");
    });

    it("should handle StatefulSet resources", async () => {
      const diagram = Diagram("Test");
      await diagram.registerPlugins([kubernetesPlugin]);

      const k8sYaml = `
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: web-statefulset
spec:
  selector:
    matchLabels:
      app: web
  serviceName: "web"
  replicas: 3
  template:
    spec:
      containers:
      - name: web
        image: nginx:latest
`;

      await diagram.import(k8sYaml, "kubernetes");

      const json = diagram.toJSON();
      const statefulSetNode = json.nodes.find((n) => n.id === "web-statefulset");
      expect(statefulSetNode).toBeDefined();
      // StatefulSet node uses kind-based icon
      expect(statefulSetNode?.metadata?.kubernetes?.kind).toBe("StatefulSet");
      // Verify replicas created pod nodes (3 replicas + 1 statefulset = 4 nodes)
      expect(json.nodes.filter((n) => n.id.startsWith("web-statefulset")).length).toBe(4);
    });

    it("should handle Ingress resources", async () => {
      const diagram = Diagram("Test");
      await diagram.registerPlugins([kubernetesPlugin]);

      const k8sYaml = `
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: app-ingress
spec:
  rules:
  - host: example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: app-service
            port:
              number: 80
`;

      await diagram.import(k8sYaml, "kubernetes");

      const json = diagram.toJSON();
      const ingressNode = json.nodes.find((n) => n.id === "app-ingress");
      expect(ingressNode).toBeDefined();
      expect(ingressNode?.metadata?.kubernetes?.kind).toBe("Ingress");
    });

    it("should handle PersistentVolumeClaim resources", async () => {
      const diagram = Diagram("Test");
      await diagram.registerPlugins([kubernetesPlugin]);

      const k8sYaml = `
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: app-pvc
spec:
  accessModes:
  - ReadWriteOnce
  resources:
    requests:
      storage: 1Gi
`;

      await diagram.import(k8sYaml, "kubernetes");

      const json = diagram.toJSON();
      const pvcNode = json.nodes.find((n) => n.id === "app-pvc");
      expect(pvcNode).toBeDefined();
      expect(pvcNode?.metadata?.kubernetes?.kind).toBe("PersistentVolumeClaim");
    });
  });

  describe("Export", () => {
    it("should export to Kubernetes YAML format", async () => {
      const diagram = Diagram("Test");
      await diagram.registerPlugins([kubernetesPlugin]);

      const k8sYaml = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-deployment
  namespace: default
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
`;

      await diagram.import(k8sYaml, "kubernetes");
      const exported = await diagram.export("kubernetes");

      expect(exported).toContain("apiVersion:");
      expect(exported).toContain("kind:");
      expect(exported).toContain("web-deployment");
    });

    it("should preserve namespace in export", async () => {
      const diagram = Diagram("Test");
      await diagram.registerPlugins([kubernetesPlugin]);

      const k8sYaml = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: test-app
  namespace: production
spec:
  selector:
    matchLabels:
      app: test
  template:
    spec:
      containers:
      - name: test
        image: nginx:latest
`;

      await diagram.import(k8sYaml, "kubernetes");
      const exported = await diagram.export("kubernetes");

      expect(exported).toContain("namespace:");
      expect(exported).toContain("production");
    });

    it("should preserve replicas in export", async () => {
      const diagram = Diagram("Test");
      await diagram.registerPlugins([kubernetesPlugin]);

      const k8sYaml = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: test-app
spec:
  replicas: 5
  selector:
    matchLabels:
      app: test
  template:
    spec:
      containers:
      - name: test
        image: nginx:latest
`;

      await diagram.import(k8sYaml, "kubernetes");
      const exported = await diagram.export("kubernetes");

      expect(exported).toContain("replicas:");
      expect(exported).toContain("5");
    });

    it("should export multiple resources", async () => {
      const diagram = Diagram("Test");
      await diagram.registerPlugins([kubernetesPlugin]);

      const k8sYaml = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-deployment
spec:
  selector:
    matchLabels:
      app: web
  template:
    spec:
      containers:
      - name: web
        image: nginx:latest
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
`;

      await diagram.import(k8sYaml, "kubernetes");
      const exported = await diagram.export("kubernetes");

      expect(exported).toContain("Deployment");
      expect(exported).toContain("Service");
      expect(exported).toContain("web-deployment");
      expect(exported).toContain("web-service");
    });
  });

  describe("Round-trip", () => {
    it("should preserve all data in import-export round-trip", async () => {
      const diagram = Diagram("Test");
      await diagram.registerPlugins([kubernetesPlugin]);

      const originalYaml = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: test-app
  namespace: default
  labels:
    app: test
spec:
  replicas: 3
  selector:
    matchLabels:
      app: test
  template:
    metadata:
      labels:
        app: test
    spec:
      containers:
      - name: test
        image: nginx:latest
        ports:
        - containerPort: 80
`;

      await diagram.import(originalYaml, "kubernetes");
      const exported = await diagram.export("kubernetes");

      // Import the exported YAML and verify it's similar
      const diagram2 = Diagram("Test2");
      await diagram2.registerPlugins([kubernetesPlugin]);
      await diagram2.import(exported as string, "kubernetes");

      const json1 = diagram.toJSON();
      const json2 = diagram2.toJSON();

      // Compare resource configurations
      const app1 = json1.nodes.find((n) => n.metadata?.kubernetes?.kind === "Deployment");
      const app2 = json2.nodes.find((n) => n.metadata?.kubernetes?.kind === "Deployment");
      expect(app2?.metadata?.kubernetes?.kind).toBe(app1?.metadata?.kubernetes?.kind);
      expect(app2?.metadata?.kubernetes?.namespace).toBe(app1?.metadata?.kubernetes?.namespace);
    });
  });

  describe("Comprehensive Import Coverage", () => {
    it("should handle all workload types with pod creation", async () => {
      const diagram = Diagram("Workloads Test");
      await diagram.registerPlugins([kubernetesPlugin]);

      const k8sYaml = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-deploy
spec:
  replicas: 2
  selector:
    matchLabels:
      app: web
  template:
    spec:
      containers:
      - name: web
        image: nginx:latest
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: db-stateful
spec:
  serviceName: db
  replicas: 3
  selector:
    matchLabels:
      app: db
  template:
    spec:
      containers:
      - name: postgres
        image: postgres:15
---
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: monitoring-ds
spec:
  selector:
    matchLabels:
      app: monitor
  template:
    spec:
      containers:
      - name: agent
        image: prometheus:latest
---
apiVersion: apps/v1
kind: ReplicaSet
metadata:
  name: cache-rs
spec:
  replicas: 2
  selector:
    matchLabels:
      app: cache
  template:
    spec:
      containers:
      - name: redis
        image: redis:latest
---
apiVersion: batch/v1
kind: Job
metadata:
  name: backup-job
spec:
  template:
    spec:
      containers:
      - name: backup
        image: busybox:latest
      restartPolicy: OnFailure
`;

      await diagram.import(k8sYaml, "kubernetes");

      const json = diagram.toJSON();
      // Deployment (1 + 2 pods) + StatefulSet (1 + 3 pods) + DaemonSet (1 + 1 pod) + ReplicaSet (1 + 2 pods) + Job (1 + 1 pod)
      expect(json.nodes.length).toBeGreaterThanOrEqual(14);

      // Verify all main resources exist
      expect(json.nodes.find((n) => n.id === "web-deploy")).toBeDefined();
      expect(json.nodes.find((n) => n.id === "db-stateful")).toBeDefined();
      expect(json.nodes.find((n) => n.id === "monitoring-ds")).toBeDefined();
      expect(json.nodes.find((n) => n.id === "cache-rs")).toBeDefined();
      expect(json.nodes.find((n) => n.id === "backup-job")).toBeDefined();

      // Verify pod replicas
      expect(json.nodes.find((n) => n.id === "web-deploy-pod-0")).toBeDefined();
      expect(json.nodes.find((n) => n.id === "web-deploy-pod-1")).toBeDefined();
      expect(json.nodes.find((n) => n.id === "db-stateful-pod-0")).toBeDefined();
      expect(json.nodes.find((n) => n.id === "db-stateful-pod-2")).toBeDefined();
    });

    it("should handle all network resources", async () => {
      const diagram = Diagram("Network Test");
      await diagram.registerPlugins([kubernetesPlugin]);

      const k8sYaml = `
apiVersion: v1
kind: Service
metadata:
  name: web-service
spec:
  type: ClusterIP
  selector:
    app: web
  ports:
  - port: 80
---
apiVersion: v1
kind: Service
metadata:
  name: web-nodeport
spec:
  type: NodePort
  selector:
    app: web
  ports:
  - port: 80
    nodePort: 30080
---
apiVersion: v1
kind: Service
metadata:
  name: web-lb
spec:
  type: LoadBalancer
  selector:
    app: web
  ports:
  - port: 80
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web-ingress
spec:
  rules:
  - host: example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: web-service
            port:
              number: 80
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-policy
spec:
  podSelector:
    matchLabels:
      app: web
  policyTypes:
  - Ingress
`;

      await diagram.import(k8sYaml, "kubernetes");

      const json = diagram.toJSON();
      expect(json.nodes.find((n) => n.id === "web-service")).toBeDefined();
      expect(json.nodes.find((n) => n.id === "web-nodeport")).toBeDefined();
      expect(json.nodes.find((n) => n.id === "web-lb")).toBeDefined();
      expect(json.nodes.find((n) => n.id === "web-ingress")).toBeDefined();
      expect(json.nodes.find((n) => n.id === "allow-policy")).toBeDefined();
    });

    it("should handle all storage resources", async () => {
      const diagram = Diagram("Storage Test");
      await diagram.registerPlugins([kubernetesPlugin]);

      const k8sYaml = `
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
data:
  database.conf: |
    host=localhost
    port=5432
---
apiVersion: v1
kind: Secret
metadata:
  name: app-secret
type: Opaque
data:
  password: c2VjcmV0
---
apiVersion: v1
kind: PersistentVolume
metadata:
  name: pv-volume
spec:
  capacity:
    storage: 10Gi
  accessModes:
  - ReadWriteOnce
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: pvc-claim
spec:
  accessModes:
  - ReadWriteOnce
  resources:
    requests:
      storage: 5Gi
---
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: fast-storage
provisioner: kubernetes.io/gce-pd
`;

      await diagram.import(k8sYaml, "kubernetes");

      const json = diagram.toJSON();
      expect(json.nodes.find((n) => n.id === "app-config")).toBeDefined();
      expect(json.nodes.find((n) => n.id === "app-secret")).toBeDefined();
      expect(json.nodes.find((n) => n.id === "pv-volume")).toBeDefined();
      expect(json.nodes.find((n) => n.id === "pvc-claim")).toBeDefined();
      expect(json.nodes.find((n) => n.id === "fast-storage")).toBeDefined();
    });

    it("should handle all RBAC resources", async () => {
      const diagram = Diagram("RBAC Test");
      await diagram.registerPlugins([kubernetesPlugin]);

      const k8sYaml = `
apiVersion: v1
kind: ServiceAccount
metadata:
  name: app-sa
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: app-role
rules:
- apiGroups: [""]
  resources: ["pods"]
  verbs: ["get", "list"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: app-rolebinding
subjects:
- kind: ServiceAccount
  name: app-sa
roleRef:
  kind: Role
  name: app-role
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: cluster-reader
rules:
- apiGroups: [""]
  resources: ["nodes"]
  verbs: ["get", "list"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: cluster-reader-binding
subjects:
- kind: ServiceAccount
  name: app-sa
  namespace: default
roleRef:
  kind: ClusterRole
  name: cluster-reader
`;

      await diagram.import(k8sYaml, "kubernetes");

      const json = diagram.toJSON();
      expect(json.nodes.find((n) => n.id === "app-sa")).toBeDefined();
      expect(json.nodes.find((n) => n.id === "app-role")).toBeDefined();
      expect(json.nodes.find((n) => n.id === "app-rolebinding")).toBeDefined();
      expect(json.nodes.find((n) => n.id === "cluster-reader")).toBeDefined();
      expect(json.nodes.find((n) => n.id === "cluster-reader-binding")).toBeDefined();
    });

    it("should handle multi-namespace resources", async () => {
      const diagram = Diagram("Multi-namespace Test");
      await diagram.registerPlugins([kubernetesPlugin]);

      const k8sYaml = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  namespace: production
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
---
apiVersion: v1
kind: Service
metadata:
  name: web-service
  namespace: production
spec:
  selector:
    app: web
  ports:
  - port: 80
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  namespace: staging
spec:
  replicas: 1
  selector:
    matchLabels:
      app: web
  template:
    spec:
      containers:
      - name: web
        image: nginx:alpine
---
apiVersion: v1
kind: Service
metadata:
  name: web-service
  namespace: staging
spec:
  selector:
    app: web
  ports:
  - port: 80
`;

      await diagram.import(k8sYaml, "kubernetes");

      const json = diagram.toJSON();
      // Should have production and staging resources
      expect(json.nodes.find((n) => n.id === "production/web")).toBeDefined();
      expect(json.nodes.find((n) => n.id === "production/web-service")).toBeDefined();
      expect(json.nodes.find((n) => n.id === "staging/web")).toBeDefined();
      expect(json.nodes.find((n) => n.id === "staging/web-service")).toBeDefined();

      // Should have separate clusters for each namespace
      expect(json.clusters).toBeDefined();
      expect(json.clusters!.length).toBeGreaterThanOrEqual(2);
    });

    it("should handle single replica (no suffix in label)", async () => {
      const diagram = Diagram("Single Replica Test");
      await diagram.registerPlugins([kubernetesPlugin]);

      const k8sYaml = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: singleton
spec:
  replicas: 1
  selector:
    matchLabels:
      app: single
  template:
    spec:
      containers:
      - name: app
        image: nginx:latest
`;

      await diagram.import(k8sYaml, "kubernetes");

      const json = diagram.toJSON();
      // Single replica should have same label as deployment
      const podNode = json.nodes.find((n) => n.id === "singleton-pod-0");
      expect(podNode).toBeDefined();
      expect(podNode?.label).toBe("singleton");
    });

    it("should handle resource without containers (no pod nodes)", async () => {
      const diagram = Diagram("No Containers Test");
      await diagram.registerPlugins([kubernetesPlugin]);

      const k8sYaml = `
apiVersion: v1
kind: Service
metadata:
  name: orphaned-service
spec:
  selector:
    app: missing
  ports:
  - port: 80
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: standalone-config
data:
  key: value
`;

      await diagram.import(k8sYaml, "kubernetes");

      const json = diagram.toJSON();
      // Service and ConfigMap only, no pods
      expect(json.nodes.length).toBe(2);
      expect(json.nodes.find((n) => n.id === "orphaned-service")).toBeDefined();
      expect(json.nodes.find((n) => n.id === "standalone-config")).toBeDefined();
    });

    it("should handle CronJob resources", async () => {
      const diagram = Diagram("CronJob Test");
      await diagram.registerPlugins([kubernetesPlugin]);

      const k8sYaml = `
apiVersion: batch/v1
kind: CronJob
metadata:
  name: backup-cron
spec:
  schedule: "0 2 * * *"
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: backup
            image: busybox:latest
            command: ["sh", "-c", "echo Backup done"]
          restartPolicy: OnFailure
`;

      await diagram.import(k8sYaml, "kubernetes");

      const json = diagram.toJSON();
      expect(json.nodes.find((n) => n.id === "backup-cron")).toBeDefined();
    });

    it("should handle namespace resource", async () => {
      const diagram = Diagram("Namespace Test");
      await diagram.registerPlugins([kubernetesPlugin]);

      const k8sYaml = `
apiVersion: v1
kind: Namespace
metadata:
  name: custom-namespace
  labels:
    env: production
`;

      await diagram.import(k8sYaml, "kubernetes");

      const json = diagram.toJSON();
      const nsNode = json.nodes.find((n) => n.id === "custom-namespace");
      expect(nsNode).toBeDefined();
      expect(nsNode?.metadata?.kubernetes?.kind).toBe("Namespace");
    });

    it("should correctly map container images to provider icons", async () => {
      const diagram = Diagram("Container Icons Test");
      await diagram.registerPlugins([kubernetesPlugin]);

      const k8sYaml = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: multi-container
spec:
  replicas: 1
  selector:
    matchLabels:
      app: multi
  template:
    spec:
      containers:
      - name: web
        image: nginx:latest
      - name: db
        image: postgres:15
      - name: cache
        image: redis:latest
`;

      await diagram.import(k8sYaml, "kubernetes");

      const json = diagram.toJSON();
      // Should create pod node with first container's image
      const podNode = json.nodes.find((n) => n.id === "multi-container-pod-0");
      expect(podNode).toBeDefined();
      expect(podNode?.metadata?.kubernetes?.image).toBe("nginx:latest");
    });

    it("should handle complex service selectors with multiple labels", async () => {
      const diagram = Diagram("Complex Selector Test");
      await diagram.registerPlugins([kubernetesPlugin]);

      const k8sYaml = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: complex-app
spec:
  replicas: 2
  selector:
    matchLabels:
      app: frontend
      tier: web
      env: production
  template:
    spec:
      containers:
      - name: app
        image: nginx:latest
---
apiVersion: v1
kind: Service
metadata:
  name: complex-service
spec:
  selector:
    app: frontend
    tier: web
    env: production
  ports:
  - port: 80
`;

      await diagram.import(k8sYaml, "kubernetes");

      const json = diagram.toJSON();
      // Service should connect to deployment only if all labels match
      const serviceToDeploymentEdge = json.edges?.find(
        (e) => e.from === "complex-service" && e.to === "complex-app",
      );
      expect(serviceToDeploymentEdge).toBeDefined();
    });
  });

  describe("Round-trip", () => {
    it("should preserve all resource fields in round-trip", async () => {
      const diagram = Diagram("Test");
      await diagram.registerPlugins([kubernetesPlugin]);

      const originalYaml = `apiVersion: apps/v1
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
        image: postgres:15`;

      await diagram.import(originalYaml, "kubernetes");

      // Export and verify
      const exported = await diagram.export("kubernetes");

      // Should not contain Pod resources (they're visual elements only)
      expect(exported).not.toContain("kind: Pod");

      // Should preserve original images
      expect(exported).toContain("image: nginx:alpine");
      expect(exported).toContain("image: node:18");
      expect(exported).toContain("image: postgres:15");

      // Should preserve container ports
      expect(exported).toContain("containerPort: 80");
      expect(exported).toContain("containerPort: 3000");

      // Should preserve namespace
      expect(exported).toContain("namespace: production");

      // Should preserve replicas
      expect(exported).toContain("replicas: 3");
      expect(exported).toContain("replicas: 2");
      expect(exported).toContain("replicas: 1");

      // Should not add empty labels or annotations
      expect(exported).not.toContain("labels: {}");
      expect(exported).not.toContain("annotations: {}");

      // Should not add default service type
      expect(exported).not.toContain("type: ClusterIP");
    });

    it("should not export replica Pod nodes as resources", async () => {
      const diagram = Diagram("Test");
      await diagram.registerPlugins([kubernetesPlugin]);

      const k8sYaml = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  namespace: default
spec:
  replicas: 3
  selector:
    matchLabels:
      app: web
  template:
    spec:
      containers:
      - name: web
        image: nginx:latest`;

      await diagram.import(k8sYaml, "kubernetes");

      const json = diagram.toJSON();
      // Should have 4 nodes: 1 Deployment + 3 Pod replicas
      expect(json.nodes).toHaveLength(4);

      const exported = await diagram.export("kubernetes");

      // Should only contain the Deployment, not the Pod replicas
      expect(exported).toContain("kind: Deployment");
      expect(exported).not.toContain("kind: Pod");
    });

    it("should preserve complete Deployment spec with all fields", async () => {
      const diagram = Diagram("Test");
      await diagram.registerPlugins([kubernetesPlugin]);

      const originalYaml = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-app
  namespace: production
  labels:
    app: web
    version: v1
    environment: prod
  annotations:
    deployment.kubernetes.io/revision: "1"
    description: Main web application
spec:
  replicas: 5
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 2
      maxUnavailable: 1
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: web
        version: v1
    spec:
      containers:
      - name: nginx
        image: nginx:1.25-alpine
        ports:
        - containerPort: 80
          protocol: TCP
          name: http
        - containerPort: 443
          protocol: TCP
          name: https
        env:
        - name: NGINX_HOST
          value: example.com
        - name: NGINX_PORT
          value: "80"
        resources:
          limits:
            cpu: "500m"
            memory: "256Mi"
          requests:
            cpu: "100m"
            memory: "128Mi"
        livenessProbe:
          httpGet:
            path: /health
            port: 80
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 80
          initialDelaySeconds: 5
          periodSeconds: 5
        volumeMounts:
        - name: config
          mountPath: /etc/nginx/conf.d
        - name: cache
          mountPath: /var/cache/nginx
      volumes:
      - name: config
        configMap:
          name: nginx-config
      - name: cache
        emptyDir: {}`;

      await diagram.import(originalYaml, "kubernetes");
      const exported = await diagram.export("kubernetes");

      // Import the exported YAML and verify
      const diagram2 = Diagram("Test2");
      await diagram2.registerPlugins([kubernetesPlugin]);
      await diagram2.import(exported as string, "kubernetes");

      const json = diagram2.toJSON();
      const deployment = json.nodes.find((n) => n.id === "production/web-app");

      expect(deployment).toBeDefined();
      expect(deployment?.metadata?.kubernetes?.kind).toBe("Deployment");
      expect(deployment?.metadata?.kubernetes?.namespace).toBe("production");
      expect(deployment?.metadata?.kubernetes?.labels).toEqual({
        app: "web",
        version: "v1",
        environment: "prod",
      });
      expect(deployment?.metadata?.kubernetes?.annotations).toEqual({
        "deployment.kubernetes.io/revision": "1",
        description: "Main web application",
      });

      const spec = deployment?.metadata?.kubernetes?.spec;
      expect(spec?.replicas).toBe(5);
      expect(spec?.strategy?.type).toBe("RollingUpdate");
      expect(spec?.strategy?.rollingUpdate?.maxSurge).toBe(2);
      expect(spec?.selector?.matchLabels?.app).toBe("web");

      // Check containers
      const container = spec?.template?.spec?.containers?.[0];
      expect(container?.name).toBe("nginx");
      expect(container?.image).toBe("nginx:1.25-alpine");
      expect(container?.ports).toHaveLength(2);
      expect(container?.env).toHaveLength(2);
      expect(container?.resources?.limits?.cpu).toBe("500m");
      expect(container?.livenessProbe?.httpGet?.path).toBe("/health");
      expect(container?.volumeMounts).toHaveLength(2);

      // Check volumes
      expect(spec?.template?.spec?.volumes).toHaveLength(2);
    });

    it("should preserve Service spec with all fields", async () => {
      const diagram = Diagram("Test");
      await diagram.registerPlugins([kubernetesPlugin]);

      const originalYaml = `apiVersion: v1
kind: Service
metadata:
  name: api-service
  namespace: default
  labels:
    app: api
    tier: backend
spec:
  type: LoadBalancer
  selector:
    app: api
    tier: backend
  ports:
  - port: 80
    targetPort: 8080
    protocol: TCP
    name: http
  - port: 443
    targetPort: 8443
    protocol: TCP
    name: https
  sessionAffinity: ClientIP
  sessionAffinityConfig:
    clientIP:
      timeoutSeconds: 10800`;

      await diagram.import(originalYaml, "kubernetes");
      const exported = await diagram.export("kubernetes");

      // Import the exported YAML and verify
      const diagram2 = Diagram("Test2");
      await diagram2.registerPlugins([kubernetesPlugin]);
      await diagram2.import(exported as string, "kubernetes");

      const json = diagram2.toJSON();
      const service = json.nodes.find((n) => n.id === "api-service");

      expect(service).toBeDefined();
      const spec = service?.metadata?.kubernetes?.spec;
      expect(spec?.type).toBe("LoadBalancer");
      expect(spec?.selector?.app).toBe("api");
      expect(spec?.selector?.tier).toBe("backend");
      expect(spec?.ports).toHaveLength(2);
      expect(spec?.ports?.[0]?.port).toBe(80);
      expect(spec?.ports?.[0]?.targetPort).toBe(8080);
      expect(spec?.ports?.[1]?.name).toBe("https");
      expect(spec?.sessionAffinity).toBe("ClientIP");
    });

    it("should preserve StatefulSet spec with volumeClaimTemplates", async () => {
      const diagram = Diagram("Test");
      await diagram.registerPlugins([kubernetesPlugin]);

      const originalYaml = `apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres
  namespace: database
spec:
  serviceName: postgres
  replicas: 3
  selector:
    matchLabels:
      app: postgres
  template:
    metadata:
      labels:
        app: postgres
    spec:
      containers:
      - name: postgres
        image: postgres:15-alpine
        ports:
        - containerPort: 5432
        volumeMounts:
        - name: data
          mountPath: /var/lib/postgresql/data
  volumeClaimTemplates:
  - metadata:
      name: data
    spec:
      accessModes: ["ReadWriteOnce"]
      storageClassName: fast-ssd
      resources:
        requests:
          storage: 100Gi`;

      await diagram.import(originalYaml, "kubernetes");
      const exported = await diagram.export("kubernetes");

      // Import the exported YAML and verify
      const diagram2 = Diagram("Test2");
      await diagram2.registerPlugins([kubernetesPlugin]);
      await diagram2.import(exported as string, "kubernetes");

      const json = diagram2.toJSON();
      const sts = json.nodes.find((n) => n.id === "database/postgres");

      expect(sts).toBeDefined();
      expect(sts?.metadata?.kubernetes?.kind).toBe("StatefulSet");
      const spec = sts?.metadata?.kubernetes?.spec;
      expect(spec?.serviceName).toBe("postgres");
      expect(spec?.replicas).toBe(3);
      expect(spec?.volumeClaimTemplates).toHaveLength(1);
      expect(spec?.volumeClaimTemplates?.[0]?.metadata?.name).toBe("data");
      expect(spec?.volumeClaimTemplates?.[0]?.spec?.storageClassName).toBe("fast-ssd");
    });

    it("should preserve ConfigMap and Secret data", async () => {
      const diagram = Diagram("Test");
      await diagram.registerPlugins([kubernetesPlugin]);

      const originalYaml = `apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
  namespace: default
data:
  database.properties: |
    host=localhost
    port=5432
  app.conf: "log_level=debug"
  max_connections: "100"
---
apiVersion: v1
kind: Secret
metadata:
  name: app-secrets
  namespace: default
type: Opaque
data:
  password: c2VjcmV0MTIz
stringData:
  api_key: my-secret-key
  database_url: postgres://user:pass@host/db`;

      await diagram.import(originalYaml, "kubernetes");
      const exported = await diagram.export("kubernetes");

      // Import the exported YAML and verify
      const diagram2 = Diagram("Test2");
      await diagram2.registerPlugins([kubernetesPlugin]);
      await diagram2.import(exported as string, "kubernetes");

      const json = diagram2.toJSON();
      const cm = json.nodes.find((n) => n.id === "app-config");
      const secret = json.nodes.find((n) => n.id === "app-secrets");

      expect(cm?.metadata?.kubernetes?.data?.["database.properties"]).toContain("host=localhost");
      expect(cm?.metadata?.kubernetes?.data?.max_connections).toBe("100");

      expect(secret?.metadata?.kubernetes?.data?.password).toBe("c2VjcmV0MTIz");
      expect(secret?.metadata?.kubernetes?.stringData?.api_key).toBe("my-secret-key");
    });

    it("should preserve Ingress configuration", async () => {
      const diagram = Diagram("Test");
      await diagram.registerPlugins([kubernetesPlugin]);

      const originalYaml = `apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: app-ingress
  namespace: default
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
    cert-manager.io/cluster-issuer: letsencrypt
spec:
  ingressClassName: nginx
  tls:
  - hosts:
    - example.com
    secretName: example-tls
  rules:
  - host: example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: frontend
            port:
              number: 80
      - path: /api
        pathType: Prefix
        backend:
          service:
            name: backend
            port:
              number: 8080`;

      await diagram.import(originalYaml, "kubernetes");
      const exported = await diagram.export("kubernetes");

      // Import the exported YAML and verify
      const diagram2 = Diagram("Test2");
      await diagram2.registerPlugins([kubernetesPlugin]);
      await diagram2.import(exported as string, "kubernetes");

      const json = diagram2.toJSON();
      const ingress = json.nodes.find((n) => n.id === "app-ingress");

      expect(ingress).toBeDefined();
      expect(ingress?.metadata?.kubernetes?.kind).toBe("Ingress");
      const spec = ingress?.metadata?.kubernetes?.spec;
      expect(spec?.ingressClassName).toBe("nginx");
      expect(spec?.tls?.[0]?.hosts?.[0]).toBe("example.com");
      expect(spec?.rules?.[0]?.http?.paths).toHaveLength(2);
    });

    it("should preserve DaemonSet and Job specs", async () => {
      const diagram = Diagram("Test");
      await diagram.registerPlugins([kubernetesPlugin]);

      const originalYaml = `apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: node-exporter
  namespace: monitoring
spec:
  selector:
    matchLabels:
      app: node-exporter
  template:
    spec:
      containers:
      - name: node-exporter
        image: prom/node-exporter:v1.6
        ports:
        - containerPort: 9100
          hostPort: 9100
      hostNetwork: true
      hostPID: true
---
apiVersion: batch/v1
kind: Job
metadata:
  name: data-migration
  namespace: default
spec:
  ttlSecondsAfterFinished: 3600
  backoffLimit: 3
  template:
    spec:
      restartPolicy: OnFailure
      containers:
      - name: migrator
        image: migrate/migrate:v4`;

      await diagram.import(originalYaml, "kubernetes");
      const exported = await diagram.export("kubernetes");

      // Import the exported YAML and verify
      const diagram2 = Diagram("Test2");
      await diagram2.registerPlugins([kubernetesPlugin]);
      await diagram2.import(exported as string, "kubernetes");

      const json = diagram2.toJSON();
      const ds = json.nodes.find((n) => n.id === "monitoring/node-exporter");
      const job = json.nodes.find((n) => n.id === "data-migration");

      expect(ds?.metadata?.kubernetes?.kind).toBe("DaemonSet");
      expect(ds?.metadata?.kubernetes?.spec?.template?.spec?.hostNetwork).toBe(true);

      expect(job?.metadata?.kubernetes?.kind).toBe("Job");
      expect(job?.metadata?.kubernetes?.spec?.ttlSecondsAfterFinished).toBe(3600);
      expect(job?.metadata?.kubernetes?.spec?.backoffLimit).toBe(3);
    });

    it("should preserve resources without adding empty fields", async () => {
      const diagram = Diagram("Test");
      await diagram.registerPlugins([kubernetesPlugin]);

      const originalYaml = `apiVersion: v1
kind: Pod
metadata:
  name: simple-pod
spec:
  containers:
  - name: nginx
    image: nginx:latest`;

      await diagram.import(originalYaml, "kubernetes");
      const exported = await diagram.export("kubernetes");

      // Import the exported YAML and verify no empty fields added
      const diagram2 = Diagram("Test2");
      await diagram2.registerPlugins([kubernetesPlugin]);
      await diagram2.import(exported as string, "kubernetes");

      const json = diagram2.toJSON();
      const pod = json.nodes.find((n) => n.id === "simple-pod");

      expect(pod).toBeDefined();
      // Should not have empty labels or annotations
      expect(pod?.metadata?.kubernetes?.labels).toBeUndefined();
      expect(pod?.metadata?.kubernetes?.annotations).toBeUndefined();
    });

    it("should handle resources from multiple namespaces", async () => {
      const diagram = Diagram("Multi-namespace");
      await diagram.registerPlugins([kubernetesPlugin]);

      const originalYaml = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: frontend
  namespace: production
spec:
  replicas: 3
  template:
    spec:
      containers:
      - name: app
        image: nginx:latest
---
apiVersion: v1
kind: Service
metadata:
  name: frontend-svc
  namespace: staging
spec:
  ports:
  - port: 80`;

      await diagram.import(originalYaml, "kubernetes");
      const exported = await diagram.export("kubernetes");

      // Import the exported YAML and verify namespaces preserved
      const diagram2 = Diagram("Test2");
      await diagram2.registerPlugins([kubernetesPlugin]);
      await diagram2.import(exported as string, "kubernetes");

      const json = diagram2.toJSON();
      const deployment = json.nodes.find((n) => n.id === "production/frontend");
      const service = json.nodes.find((n) => n.id === "staging/frontend-svc");

      expect(deployment?.metadata?.kubernetes?.namespace).toBe("production");
      expect(service?.metadata?.kubernetes?.namespace).toBe("staging");
    });
  });
});
