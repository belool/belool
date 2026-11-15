#include "OZSound.h"
#include "Sound/SoundWaveProcedural.h"
#include "Sound/SoundAttenuation.h"
#include "Kismet/GameplayStatics.h"

namespace
{
	constexpr int32 Rate = 22050;

	TArray<uint8> Synth(OZSound::EKind Kind)
	{
		using OZSound::EKind;
		float Dur = 0.3f;
		switch (Kind)
		{
		case EKind::Explosion: Dur = 1.8f; break;
		case EKind::Shot: Dur = 0.45f; break;
		case EKind::Step: Dur = 0.08f; break;
		case EKind::Hit: case EKind::Empty: Dur = 0.06f; break;
		case EKind::Kill: Dur = 0.2f; break;
		default: break;
		}
		const int32 N = (int32)(Dur * Rate);
		TArray<int16> S; S.SetNumZeroed(N);
		FRandomStream R(1234 + (int32)Kind);
		float Lp = 0.f, Lp2 = 0.f;
		for (int32 i = 0; i < N; i++)
		{
			const float T = (float)i / Rate;
			const float Noise = R.FRandRange(-1.f, 1.f);
			float V = 0.f;
			switch (Kind)
			{
			case EKind::Shot:
				Lp += (Noise - Lp) * 0.35f;
				V = Lp * FMath::Exp(-T * 14.f) * 1.4f + FMath::Sin(2 * UE_PI * 70.f * T) * FMath::Exp(-T * 18.f) * 0.9f
					+ Noise * FMath::Exp(-T * 90.f) * 0.5f;
				break;
			case EKind::ShotSuppressed:
				Lp += (Noise - Lp) * 0.15f;
				V = Lp * FMath::Exp(-T * 35.f) * 0.8f;
				break;
			case EKind::Explosion:
				Lp += (Noise - Lp) * 0.04f; Lp2 += (Lp - Lp2) * 0.2f;
				V = Lp2 * 6.f * FMath::Exp(-T * 2.2f) + FMath::Sin(2 * UE_PI * (45.f - 20.f * T) * T) * FMath::Exp(-T * 3.f) * 0.8f;
				break;
			case EKind::Impact:
				Lp += (Noise - Lp) * 0.5f;
				V = Lp * FMath::Exp(-T * 60.f);
				break;
			case EKind::Step:
				Lp += (Noise - Lp) * 0.12f;
				V = Lp * FMath::Exp(-T * 50.f) * 1.5f;
				break;
			case EKind::Reload:
				V = (FMath::Sin(2 * UE_PI * 1200.f * T) * FMath::Exp(-T * 60.f) + (T > 0.15f ? FMath::Sin(2 * UE_PI * 800.f * T) * FMath::Exp(-(T - 0.15f) * 50.f) : 0.f)) * 0.4f;
				break;
			case EKind::Hit:
				V = (FMath::Fmod(T * 1800.f, 1.f) < 0.5f ? 0.3f : -0.3f) * FMath::Exp(-T * 40.f);
				break;
			case EKind::Kill:
				V = FMath::Sin(2 * UE_PI * (900.f + 2000.f * T) * T) * FMath::Exp(-T * 10.f) * 0.4f;
				break;
			case EKind::Empty:
				V = (FMath::Fmod(T * 2000.f, 1.f) < 0.5f ? 0.25f : -0.25f) * FMath::Exp(-T * 80.f);
				break;
			case EKind::Melee:
				Lp += (Noise - Lp) * 0.3f;
				V = Lp * FMath::Exp(-T * 25.f);
				break;
			}
			S[i] = (int16)FMath::Clamp(V * 22000.f, -32767.f, 32767.f);
		}
		TArray<uint8> Bytes;
		Bytes.Append((const uint8*)S.GetData(), S.Num() * sizeof(int16));
		return Bytes;
	}

	const TArray<uint8>& Buffer(OZSound::EKind Kind)
	{
		static TMap<uint8, TArray<uint8>> Cache;
		if (!Cache.Contains((uint8)Kind)) Cache.Add((uint8)Kind, Synth(Kind));
		return Cache[(uint8)Kind];
	}

	USoundAttenuation* Attenuation(float Falloff)
	{
		static TMap<int32, USoundAttenuation*> Cache;
		const int32 Key = (int32)Falloff;
		if (USoundAttenuation** Found = Cache.Find(Key)) return *Found;
		USoundAttenuation* A = NewObject<USoundAttenuation>();
		A->AddToRoot();
		A->Attenuation.bAttenuate = true;
		A->Attenuation.bSpatialize = true;
		A->Attenuation.AttenuationShapeExtents = FVector(500.f, 0.f, 0.f);
		A->Attenuation.FalloffDistance = Falloff;
		Cache.Add(Key, A);
		return A;
	}
}

void OZSound::Play(const UObject* WorldContext, EKind Kind, const FVector& Location, float Pitch, float Volume, bool b2D)
{
	if (!WorldContext) return;
	const TArray<uint8>& Data = Buffer(Kind);
	USoundWaveProcedural* Wave = NewObject<USoundWaveProcedural>();
	Wave->SetSampleRate(Rate);
	Wave->NumChannels = 1;
	Wave->Duration = (float)Data.Num() / (2.f * Rate);
	Wave->SoundGroup = SOUNDGROUP_Default;
	Wave->bLooping = false;
	Wave->QueueAudio(Data.GetData(), Data.Num());
	if (b2D) UGameplayStatics::PlaySound2D(WorldContext, Wave, Volume, Pitch);
	else
	{
		const float Falloff = Kind == EKind::Explosion ? 25000.f : (Kind == EKind::Shot ? 15000.f : 3000.f);
		UGameplayStatics::PlaySoundAtLocation(WorldContext, Wave, Location, Volume, Pitch, 0.f, Attenuation(Falloff));
	}
}
