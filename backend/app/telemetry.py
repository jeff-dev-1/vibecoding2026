from __future__ import annotations

from fastapi import FastAPI


def init_telemetry(app: FastAPI, service_name: str, endpoint: str | None) -> None:
    if not endpoint:
        return
    try:
        from opentelemetry import trace
        from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
        from opentelemetry.sdk.resources import Resource
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor
    except ImportError:
        return

    provider = TracerProvider(resource=Resource.create({"service.name": service_name}))
    provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter(endpoint=endpoint, insecure=True)))
    trace.set_tracer_provider(provider)
    FastAPIInstrumentor.instrument_app(app)


def get_tracer():
    try:
        from opentelemetry import trace
        return trace.get_tracer(__name__)
    except ImportError:
        class _Noop:
            def start_as_current_span(self, *_a, **_k):
                from contextlib import nullcontext
                return nullcontext()
        return _Noop()
