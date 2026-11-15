#pragma once

#include "CoreMinimal.h"

// ================================================================
// Sons procedurais (PCM gerado em C++ e tocado via USoundWaveProcedural):
// disparos por arma, explosões, impactos, passos, recarga e marcadores.
// Nenhum arquivo de áudio é necessário.
// ================================================================
namespace OZSound
{
	enum class EKind : uint8 { Shot, ShotSuppressed, Explosion, Impact, Step, Reload, Hit, Kill, Empty, Melee };
	OPERATIONZERO_API void Play(const UObject* WorldContext, EKind Kind, const FVector& Location, float Pitch = 1.f, float Volume = 1.f, bool b2D = false);
}
