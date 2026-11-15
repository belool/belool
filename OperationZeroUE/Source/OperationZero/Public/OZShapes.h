#pragma once

#include "CoreMinimal.h"

class UStaticMeshComponent;
class UStaticMesh;
class UMaterialInstanceDynamic;
class USceneComponent;
class AActor;

// ================================================================
// Formas básicas da engine (/Engine/BasicShapes) com cor por material
// dinâmico. Permite montar soldados, armas e cenário sem assets.
// Cubo e cilindro medem 100 cm; a esfera tem 100 cm de diâmetro.
// ================================================================
namespace OZShapes
{
	enum class EShape : uint8 { Cube, Sphere, Cylinder, Cone };

	OPERATIONZERO_API UStaticMesh* Mesh(EShape Shape);
	OPERATIONZERO_API UMaterialInstanceDynamic* Material(UObject* Outer, const FLinearColor& Color, float Roughness = 0.8f);

	// Cria e registra uma peça visual (sem colisão) presa a Parent.
	// Size em cm; Location/Rotation relativos ao Parent.
	OPERATIONZERO_API UStaticMeshComponent* AddPart(AActor* Owner, USceneComponent* Parent, EShape Shape, const FVector& Size,
		const FVector& Location, const FLinearColor& Color, const FRotator& Rotation = FRotator::ZeroRotator, bool bCastShadow = true);
}
