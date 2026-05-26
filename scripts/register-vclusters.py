#!/usr/bin/env python3
"""
Register vCluster instances with ArgoCD by creating cluster secrets.
Run this after vcluster is (re)created or ArgoCD is reinstalled.

Usage:
  python3 scripts/register-vclusters.py
"""
import json, yaml, subprocess, sys

def run(cmd, **kwargs):
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True, **kwargs)
    if result.returncode != 0 and not kwargs.get('check') is False:
        pass
    return result.stdout.strip()

for env in ['prod', 'dev', 'staging']:
    ns = f'vc-{env}'
    kubeconfig_file = f'/tmp/vc-{env}-kubeconfig.yaml'

    # Get fresh kubeconfig from vcluster
    result = subprocess.run(
        ['vcluster', 'connect', env, '--namespace', ns, '--print',
         f'--server=https://{env}.{ns}.svc.cluster.local'],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        print(f"ERROR: could not get kubeconfig for {env}: {result.stderr}")
        continue

    with open(kubeconfig_file, 'w') as f:
        f.write(result.stdout)

    cfg = yaml.safe_load(result.stdout)
    ca = cfg['clusters'][0]['cluster']['certificate-authority-data']
    cert = cfg['users'][0]['user'].get('client-certificate-data', '')
    key = cfg['users'][0]['user'].get('client-key-data', '')
    server = f'https://{env}.{ns}.svc.cluster.local'

    config_json = json.dumps({
        "tlsClientConfig": {
            "insecure": False,
            "certData": cert,
            "keyData": key,
            "caData": ca
        }
    })

    secret = {
        "apiVersion": "v1",
        "kind": "Secret",
        "metadata": {
            "name": f"vcluster-{env}",
            "namespace": "argocd",
            "labels": {
                "argocd.argoproj.io/secret-type": "cluster"
            }
        },
        "type": "Opaque",
        "stringData": {
            "name": f"vcluster-{env}",
            "server": server,
            "config": config_json
        }
    }

    apply_result = subprocess.run(
        ['kubectl', 'apply', '-f', '-'],
        input=yaml.dump(secret),
        capture_output=True, text=True
    )
    status = apply_result.stdout.strip() or apply_result.stderr.strip()
    print(f"vcluster-{env}: {status}")
