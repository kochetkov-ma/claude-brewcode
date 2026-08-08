// Groovy deployment descriptor - classified as code, never as config.
def environments = [
    dev : [host: 'dev.internal', replicas: 1],
    prod: [host: 'prod.internal', replicas: 3],
]

environments.each { name, cfg ->
    println "deploying to ${name} at ${cfg.host} with ${cfg.replicas} replicas"
}
