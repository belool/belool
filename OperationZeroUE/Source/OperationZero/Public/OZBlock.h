#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "OZBlock.generated.h"

class UStaticMeshComponent;
class AOZCharacter;

// Objeto destrutível (caixa, cerca, vidro, barril, parede modular).
UCLASS()
class OPERATIONZERO_API AOZBlock : public AActor
{
	GENERATED_BODY()

public:
	AOZBlock();

	// Size em cm. Material define cor e resistência à penetração.
	void Setup(const FVector& Size, FName InMaterial, float InHealth, bool bInExplosive, bool bInExplosiveOnly, const FLinearColor* Tint = nullptr);
	// Retorna true se destruiu.
	bool TakeHit(float Damage, bool bIsExplosive, AOZCharacter* ByCharacter);

	UPROPERTY(VisibleAnywhere, Category = "OZ") UStaticMeshComponent* Mesh;
	UPROPERTY(EditAnywhere, Category = "OZ") FName MaterialName = "wood";
	UPROPERTY(EditAnywhere, Category = "OZ") float Health = 100.f;
	UPROPERTY(EditAnywhere, Category = "OZ") bool bExplosive = false;
	UPROPERTY(EditAnywhere, Category = "OZ") bool bExplosiveOnly = false;

protected:
	FVector BoxSize = FVector(100.f);
	float MaxHealth = 100.f;
	bool bBroken = false;
	UPROPERTY() class UMaterialInstanceDynamic* Mat;
	FLinearColor BaseColor;
};
